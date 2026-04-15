// ── POST /api/generate — Partnership Deed DOCX Generation ──────────────────
// Ported from backend/server.js POST /generate
// Auth: Bearer token required
// Rate limit: 10/hour per user

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { verifyAuth, AuthError } from '@/lib/auth';
import { validateGeneratePayload } from '@/lib/validation';
import { generateDoc } from '@/lib/templates/deed';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { generateRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    let user;
    try {
      user = await verifyAuth(req);
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.status }
        );
      }
      throw err;
    }

    // 2. Rate limit
    const id = getClientIdentifier(req, user.id);
    const rl = await generateRateLimit.check(id);
    if (!rl.success) return rateLimitResponse(rl.reset);

    // 3. Parse + validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const validation = validateGeneratePayload(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: validation.errors },
        { status: 400 }
      );
    }

    const validatedData = validation.data!;

    // 4. Generate DOCX
    const buffer = await generateDoc(validatedData);
    const bizName =
      (validatedData.businessName || 'Deed')
        .replace(/[^a-zA-Z0-9_\- ]/g, '')
        .trim() || 'Deed';
    const filename = `Partnership_Deed_${bizName}.docx`;

    // 5. Upload to Supabase Storage with versioning
    const deedId = validatedData._deedId || 'unknown';

    try {
      const admin = createSupabaseAdminClient();

      // Get the next version number for this deed
      let version = 1;
      if (deedId && deedId !== 'unknown') {
        const { data: latestDoc } = await admin
          .from('deed_documents')
          .select('version')
          .eq('deed_id', deedId)
          .order('version', { ascending: false })
          .limit(1)
          .single();
        if (latestDoc) version = latestDoc.version + 1;
      }

      const storagePath = `deeds/${user.id}/${deedId}/v${version}/${filename}`;

      const { error: uploadError } = await admin.storage
        .from('deed-docs')
        .upload(storagePath, buffer, {
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: false,
        });

      if (uploadError) {
        console.error('[GENERATE] Storage upload failed:', uploadError.message);
      } else if (deedId && deedId !== 'unknown') {
        // Insert version record + update deeds.doc_url in parallel
        await Promise.all([
          admin.from('deed_documents').insert({
            deed_id: deedId,
            user_id: user.id,
            storage_path: storagePath,
            file_name: filename,
            file_size: buffer.length,
            version,
          }),
          admin
            .from('deeds')
            .update({ doc_url: storagePath })
            .eq('id', deedId)
            .eq('user_id', user.id),
        ]);
      }
    } catch (storageErr) {
      console.error(
        '[GENERATE] Storage error:',
        storageErr instanceof Error ? storageErr.message : storageErr
      );
    }

    // 6. Return the DOCX file
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    console.error(
      '[GENERATE] Error:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { success: false, error: 'Failed to generate document' },
      { status: 500 }
    );
  }
}
