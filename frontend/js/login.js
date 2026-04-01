/**
 * Login / Sign-Up page logic
 * Handles tab switching, form validation, and Supabase auth.
 */

(function () {
  'use strict';

  // ── Supabase client ────────────────────────────────────────
  var SUPABASE_URL = 'https://kihkewnaokmimfxceqox.supabase.co';
  var SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpaGtld25hb2ttaW1meGNlcW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Mzg4MjYsImV4cCI6MjA5MDUxNDgyNn0._miUNQ5GqyFQLKW13p4-HGXq2yw4LimFboqPm352Vp4';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── DOM refs ───────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    tabLogin:       $('tabLogin'),
    tabSignup:      $('tabSignup'),
    authForm:       $('authForm'),
    email:          $('email'),
    password:       $('password'),
    confirmPw:      $('confirmPassword'),
    confirmGroup:   $('confirmPasswordGroup'),
    submitBtn:      $('submitBtn'),
    errorMsg:       $('errorMsg'),
    successMsg:     $('successMsg'),
    formFooter:     $('formFooter'),
    heading:        document.querySelector('.form-heading'),
    subheading:     document.querySelector('.form-subheading'),
  };

  var mode = 'login'; // 'login' | 'signup'

  // ── Redirect if already logged in ──────────────────────────
  sb.auth.getSession().then(function (res) {
    if (res.data.session) window.location.href = '/';
  });

  // ── UI helpers ─────────────────────────────────────────────
  function showError(msg) {
    els.errorMsg.textContent = msg;
    els.errorMsg.style.display = 'block';
    els.successMsg.style.display = 'none';
  }

  function showSuccess(msg) {
    els.successMsg.textContent = msg;
    els.successMsg.style.display = 'block';
    els.errorMsg.style.display = 'none';
  }

  function hideMessages() {
    els.errorMsg.style.display = 'none';
    els.successMsg.style.display = 'none';
  }

  function updateFooter() {
    if (mode === 'login') {
      els.formFooter.innerHTML =
        'Don\'t have an account? <a id="footerLink">Sign up</a>';
      $('footerLink').addEventListener('click', function () { switchTab('signup'); });
    } else {
      els.formFooter.innerHTML =
        'Already have an account? <a id="footerLink">Login</a>';
      $('footerLink').addEventListener('click', function () { switchTab('login'); });
    }
  }

  // ── Tab switching ──────────────────────────────────────────
  function switchTab(tab) {
    mode = tab;
    hideMessages();

    var isLogin = tab === 'login';

    els.tabLogin.classList.toggle('active', isLogin);
    els.tabSignup.classList.toggle('active', !isLogin);
    els.confirmGroup.style.display = isLogin ? 'none' : 'block';
    els.submitBtn.textContent       = isLogin ? 'Sign In' : 'Create Account';
    els.heading.textContent         = isLogin ? 'Sign in to your account' : 'Create your account';
    els.subheading.textContent      = isLogin
      ? 'Enter your credentials to access the dashboard.'
      : 'Enter your details to get started.';
    els.password.autocomplete       = isLogin ? 'current-password' : 'new-password';

    updateFooter();
  }

  // ── Form submission ────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();

    var email    = els.email.value.trim();
    var password = els.password.value;

    els.submitBtn.disabled    = true;
    els.submitBtn.textContent = '...';
    hideMessages();

    try {
      if (mode === 'signup') {
        var confirmPw = els.confirmPw.value;

        if (password !== confirmPw) { showError('Passwords do not match.'); return; }
        if (password.length < 6)    { showError('Password must be at least 6 characters.'); return; }

        var result = await sb.auth.signUp({ email: email, password: password });
        if (result.error) { showError(result.error.message); return; }

        // Auto-confirmed → redirect
        if (result.data.session) { window.location.href = '/'; return; }

        // Needs email confirmation
        showSuccess('Account created! Please check your email to confirm, then login.');
        mode = 'login';
        els.tabLogin.classList.add('active');
        els.tabSignup.classList.remove('active');
        els.confirmGroup.style.display = 'none';
        els.password.autocomplete = 'current-password';
        updateFooter();
      } else {
        var signIn = await sb.auth.signInWithPassword({ email: email, password: password });
        if (signIn.error) { showError(signIn.error.message); return; }

        window.location.href = '/';
        return;
      }
    } catch (err) {
      console.error('Auth error:', err);
      showError('Something went wrong. Please try again.');
    } finally {
      els.submitBtn.disabled    = false;
      els.submitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
    }
  }

  // ── Bind events ────────────────────────────────────────────
  els.tabLogin.addEventListener('click', function () { switchTab('login'); });
  els.tabSignup.addEventListener('click', function () { switchTab('signup'); });
  els.authForm.addEventListener('submit', handleSubmit);
  updateFooter();
})();
