'use strict';

const log = require('./utils/logger');

const GEMINI_MODEL = 'gemini-2.0-flash';

function getGeminiUrl() {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

// Max image size: 4MB (Gemini accepts up to 20MB but we keep it reasonable)
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

const AADHAAR_PROMPT = `You are an Aadhaar card data extraction assistant. Extract the following fields from this Aadhaar card image.

IMPORTANT RULES:
1. Extract ONLY the English text (not Hindi/regional language text)
2. For "name": Extract the cardholder's full name in English (as printed on the card)
3. For "fatherName": Extract the father's/husband's/guardian's name in English. This appears after S/O, D/O, W/O, or C/O on the card.
4. For "relation": Return exactly one of: "S/O" (Son of), "D/O" (Daughter of), "W/O" (Wife of), or "C/O" (Care of)
5. For "dob": Extract the date of birth in DD/MM/YYYY format
6. For "gender": Extract "Male", "Female", or "Transgender"
7. For "address": Extract the full address in English. Include house number, street, area, city/village, district, state, and PIN code.
8. Do NOT include the Aadhaar number in any field
9. If a field is not visible or cannot be read, return an empty string for that field
10. If the image is the BACK side of the Aadhaar card (showing instructions/guidelines), or if it is not an Aadhaar card at all, return all empty strings
11. Clean up any OCR artifacts or extra spaces in the extracted text

Return ONLY a valid JSON object with these exact keys (no markdown, no explanation, no code blocks):
{"name": "", "fatherName": "", "relation": "", "dob": "", "gender": "", "address": ""}`;

/**
 * Extract Aadhaar card data using Google Gemini Vision API.
 * @param {Buffer} imageBuffer - The image file buffer
 * @param {string} mimeType - The image MIME type (e.g., 'image/jpeg')
 * @returns {Promise<Object>} Extracted data { name, fatherName, relation, dob, gender, address }
 */
async function extractAadhaarData(imageBuffer, mimeType) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured. Please add your Gemini API key to backend/.env');
  }

  if (imageBuffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 4MB.`);
  }

  // Convert image to base64
  const base64Image = imageBuffer.toString('base64');

  // Build Gemini API request
  const requestBody = {
    contents: [{
      parts: [
        { text: AADHAAR_PROMPT },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Image,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.1,  // Low temperature for factual extraction
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      // Relax safety for document processing (Aadhaar cards contain personal info)
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  log.info('Gemini OCR request', { imageSize: imageBuffer.length, mimeType });

  const response = await fetch(getGeminiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error('Gemini API error', { status: response.status, body: errorBody });

    if (response.status === 400) {
      throw new Error('Invalid image or request. Please try a different image.');
    }
    if (response.status === 403) {
      throw new Error('Gemini API key is invalid or does not have access. Check your API key.');
    }
    if (response.status === 429) {
      throw new Error('Gemini API rate limit exceeded. Please wait a moment and try again.');
    }
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const data = await response.json();

  // Extract the text response
  const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY') {
      throw new Error('Image was blocked by safety filters. Please try a different image.');
    }
    log.warn('Gemini returned no text content', { data: JSON.stringify(data).substring(0, 500) });
    throw new Error('No response from Gemini. The image may not be readable.');
  }

  log.info('Gemini raw response', { text: textContent.substring(0, 200) });

  // Parse JSON response
  let parsed;
  try {
    // Clean potential markdown code blocks
    const cleanedText = textContent
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    parsed = JSON.parse(cleanedText);
  } catch (parseErr) {
    log.error('Failed to parse Gemini response as JSON', { text: textContent });
    throw new Error('Failed to parse extracted data. Please try again.');
  }

  // Validate and normalize the response
  const result = {
    name: sanitizeField(parsed.name),
    fatherName: sanitizeField(parsed.fatherName || parsed.father_name || parsed.fatherSName),
    relation: sanitizeRelation(parsed.relation),
    dob: sanitizeField(parsed.dob || parsed.DOB || parsed.dateOfBirth),
    gender: sanitizeField(parsed.gender),
    address: sanitizeField(parsed.address),
  };

  // Calculate age from DOB
  result.age = calculateAge(result.dob);

  log.info('Gemini OCR result', { name: result.name, age: result.age, hasAddress: !!result.address });

  return result;
}

/**
 * Clean up a field value — trim, remove control chars, limit length
 */
function sanitizeField(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500); // Safety limit
}

/**
 * Normalize relation to one of: S/O, D/O, W/O, C/O
 */
function sanitizeRelation(value) {
  if (!value || typeof value !== 'string') return '';
  const v = value.toUpperCase().trim();
  if (v.includes('S/O') || v.includes('SON')) return 'S/O';
  if (v.includes('D/O') || v.includes('DAUGHTER')) return 'D/O';
  if (v.includes('W/O') || v.includes('WIFE')) return 'W/O';
  if (v.includes('C/O') || v.includes('CARE')) return 'C/O';
  return v.length <= 5 ? v : '';
}

/**
 * Calculate age from DOB string (DD/MM/YYYY)
 */
function calculateAge(dob) {
  if (!dob) return '';
  const match = dob.match(/(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{4})/);
  if (!match) return '';

  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);

  if (year < 1900 || year > new Date().getFullYear() || month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const md = today.getMonth() - birthDate.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birthDate.getDate())) age--;

  return age >= 0 && age <= 120 ? String(age) : '';
}

module.exports = { extractAadhaarData };
