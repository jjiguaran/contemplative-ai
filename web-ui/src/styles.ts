const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --void:      #100e1a;
    --deep:      #1c1830;
    --dusk:      #2e2850;
    --iris:      #7b6fd0;
    --lavender:  #a89fe8;
    --breath:    #4db896;
    --dawn:      #e8b87a;
    --mist:      #c0bde8;
    --ghost:     rgba(192,189,232,0.38);
    --border:    rgba(160,148,240,0.18);
    --font-display: 'Cormorant Garamond', Georgia, serif;
    --font-ui:      'DM Sans', system-ui, sans-serif;
    --ease-breath:  cubic-bezier(0.45, 0.05, 0.55, 0.95);
  }

  html, body, #root {
    height: 100%;
    background: var(--void);
    color: var(--mist);
    font-family: var(--font-ui);
    font-weight: 300;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Full-viewport atmospheric backdrop ── */
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--void);
    z-index: 0;
  }

  /* ── Layout ── */
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.25rem 3rem;
    position: relative;
    z-index: 1;
  }

  /* ── Ambient orbs ── */
  .orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(90px);
    opacity: 0.5;
    animation: drift 14s var(--ease-breath) infinite alternate;
    z-index: 0;
  }
  .orb-1 { width: 55vw; height: 55vw; max-width: 700px; max-height: 700px; background: #4a3aaa; top: -15vw; right: -10vw; animation-delay: 0s; }
  .orb-2 { width: 45vw; height: 45vw; max-width: 580px; max-height: 580px; background: #1a6e58; bottom: -10vw; left: -10vw; animation-delay: -5s; }
  .orb-3 { width: 30vw; height: 30vw; max-width: 380px; max-height: 380px; background: #8a3060; top: 50%; right: 6%; animation-delay: -9s; }

  @keyframes drift {
    from { transform: translate(0, 0) scale(1); }
    to   { transform: translate(16px, 24px) scale(1.06); }
  }

  /* ── Card ── */
  .card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    background: rgba(28, 24, 48, 0.72);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 0.5px solid var(--border);
    border-radius: 24px;
    padding: 2.5rem 2rem 2rem;
  }

  /* ── Crossfade wrapper ── */
  .fade-wrap {
    transition: opacity 0.9s var(--ease-breath);
  }
  .fade-wrap.hidden {
    opacity: 0;
    pointer-events: none;
  }

  /* ── Header ── */
  .tod {
    text-align: center;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ghost);
    margin-bottom: 0.5rem;
  }

  .brand-title {
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 300;
    letter-spacing: 0.02em;
    color: rgba(235, 232, 255, 0.92);
    text-align: center;
    line-height: 1.15;
    margin-bottom: 0.3rem;
  }

  .tagline {
    text-align: center;
    font-size: 12px;
    letter-spacing: 0.06em;
    color: var(--ghost);
    margin-bottom: 2rem;
  }

  /* ── Loading state ── */
  .loading-msg {
    text-align: center;
    font-size: 12px;
    letter-spacing: 0.08em;
    color: var(--ghost);
    margin-bottom: 1.5rem;
    animation: fade-pulse 2s ease-in-out infinite;
  }

  @keyframes fade-pulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 1; }
  }

  /* ── Pill groups ── */
  .pill-group { margin-bottom: 1.1rem; }

  .pill-label {
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(160, 148, 240, 0.45);
    margin-bottom: 8px;
  }

  .pills { display: flex; gap: 7px; flex-wrap: wrap; }

  .pill {
    padding: 7px 16px;
    border-radius: 30px;
    font-size: 13px;
    font-family: var(--font-ui);
    font-weight: 300;
    cursor: pointer;
    border: 0.5px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: rgba(192,189,232,0.45);
    transition: all 0.18s ease-out;
    user-select: none;
    letter-spacing: 0.02em;
  }

  .pill:hover {
    background: rgba(255,255,255,0.09);
    color: rgba(192,189,232,0.8);
    border-color: rgba(160,148,240,0.3);
  }

  .pill.active {
    background: rgba(123,111,208,0.2);
    border-color: rgba(123,111,208,0.55);
    color: rgba(200,190,255,0.95);
  }

  .pill:disabled, .pill.disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── Unavailable notice ── */
  .unavailable {
    font-size: 12px;
    color: rgba(232,184,122,0.7);
    letter-spacing: 0.04em;
    margin-top: 0.75rem;
    text-align: center;
  }

  /* ── Divider ── */
  .divider {
    height: 0.5px;
    background: var(--border);
    margin: 1.5rem 0;
  }

  /* ── Breathing ring ── */
  .ring-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .ring {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    border: 1px solid rgba(160,148,240,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    transition: border-color 0.3s;
    margin-bottom: 0.75rem;
  }

  .ring::before {
    content: '';
    position: absolute;
    width: 88px; height: 88px;
    border-radius: 50%;
    background: rgba(100,80,180,0.12);
    transition: background 0.3s;
  }

  .ring:hover { border-color: rgba(160,148,240,0.6); }
  .ring:hover::before { background: rgba(100,80,180,0.22); }

  .ring.playing {
    border-color: rgba(160,148,240,0.65);
    animation: breathe-ring 4s var(--ease-breath) infinite;
  }

  .ring.playing::before {
    animation: breathe-fill 4s var(--ease-breath) infinite;
  }

  @keyframes breathe-ring {
    0%,100% { transform: scale(1);    border-color: rgba(140,120,220,0.45); }
    50%      { transform: scale(1.07); border-color: rgba(140,120,220,0.85); }
  }

  @keyframes breathe-fill {
    0%,100% { transform: scale(1);    background: rgba(100,80,180,0.12); }
    50%      { transform: scale(1.06); background: rgba(100,80,180,0.28); }
  }

  .ring-icon {
    position: relative;
    z-index: 1;
    font-size: 22px;
    color: rgba(200,190,255,0.8);
    transition: color 0.2s;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ring:hover .ring-icon { color: rgba(220,215,255,1); }

  .ring-icon svg { width: 22px; height: 22px; }

  .session-label {
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--ghost);
    text-align: center;
    min-height: 16px;
    transition: color 0.4s;
  }

  .session-label.active { color: rgba(168,159,232,0.85); }

  /* ── Progress ── */
  .progress-area { margin-bottom: 1.25rem; }

  .progress-track {
    height: 2px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
    cursor: pointer;
    margin-bottom: 7px;
    position: relative;
  }

  .progress-fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--iris), var(--breath));
    width: 0%;
    transition: width 0.7s linear;
    pointer-events: none;
  }

  .time-labels {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-family: 'DM Mono', 'Courier New', monospace;
    color: rgba(192,189,232,0.25);
    letter-spacing: 0.04em;
  }

  /* ── Bottom row: play ring on left, volume sliders toward center-right ── */
  .bottom-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Left side: play ring ── */
  .bottom-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .ring-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* ── Right side: stacked volume sliders ── */
  .vol-stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    max-width: 160px;
    margin-left: 12px;
    margin-top: -8px;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(192,189,232,0.3);
    padding: 7px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.18s;
    flex-shrink: 0;
  }

  .icon-btn:hover:not(:disabled) {
    color: rgba(192,189,232,0.75);
    background: rgba(255,255,255,0.07);
  }

  .icon-btn:disabled { opacity: 0.2; cursor: not-allowed; }

  .icon-btn svg { width: 18px; height: 18px; }

  .vol-wrap {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .vol-wrap svg { width: 15px; height: 15px; color: rgba(192,189,232,0.28); flex-shrink: 0; }

  input[type=range].vol-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 2px;
    border-radius: 2px;
    background: rgba(255,255,255,0.1);
    outline: none;
    flex: 1;
    cursor: pointer;
  }

  input[type=range].vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 11px; height: 11px;
    border-radius: 50%;
    background: rgba(168,159,232,0.8);
    cursor: pointer;
  }

  /* ── Volume label for dual sliders ── */
  .vol-label {
    font-size: 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(192,189,232,0.2);
    flex-shrink: 0;
    width: 22px;
    text-align: center;
  }

  /* ── Download row below progress bar ── */
  .download-row {
    display: flex;
    justify-content: center;
    margin-bottom: 0.75rem;
  }

  /* ── Variation hint ── */
  .var-hint {
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: rgba(192,189,232,0.2);
    margin-top: 1.25rem;
  }

  .var-hint button {
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(160,148,240,0.55);
    font-size: 11px;
    font-family: var(--font-ui);
    letter-spacing: 0.04em;
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 0;
    transition: color 0.18s;
  }

  .var-hint button:hover { color: rgba(168,159,232,0.85); }

  audio { display: none; }

  .error-msg {
    text-align: center;
    font-size: 12px;
    color: rgba(232,184,122,0.7);
    margin-top: 0.5rem;
    letter-spacing: 0.03em;
  }

  /* ════════════════════════════════════════════════════════════════════
     FEEDBACK SCREEN
  ════════════════════════════════════════════════════════════════════ */

  /* Outer container that sits on top of the player via absolute positioning */
  .feedback-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.25rem 3rem;
    z-index: 2;
    transition: opacity 1.1s var(--ease-breath);
    pointer-events: none;
    opacity: 0;
  }

  .feedback-wrap.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .feedback-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    background: rgba(28, 24, 48, 0.72);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 0.5px solid var(--border);
    border-radius: 24px;
    padding: 2.8rem 2rem 2.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }

  /* Soft checkmark glyph shown after session ends */
  .session-end-glyph {
    font-size: 28px;
    margin-bottom: 1.2rem;
    opacity: 0.7;
    animation: glyph-in 1.2s var(--ease-breath) forwards;
  }

  @keyframes glyph-in {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 0.7; transform: scale(1); }
  }

  .feedback-title {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 300;
    color: rgba(235, 232, 255, 0.9);
    text-align: center;
    letter-spacing: 0.02em;
    margin-bottom: 0.35rem;
  }

  .feedback-subtitle {
    font-size: 12px;
    letter-spacing: 0.07em;
    color: var(--ghost);
    text-align: center;
    margin-bottom: 2.2rem;
  }

  /* ── Mood options ── */
  .mood-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    width: 100%;
    margin-bottom: 1.8rem;
  }

  .mood-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 10px 14px;
    border-radius: 18px;
    border: 0.5px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    cursor: pointer;
    transition: all 0.22s var(--ease-breath);
    user-select: none;
    position: relative;
    overflow: hidden;
  }

  .mood-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 18px;
    opacity: 0;
    transition: opacity 0.22s ease;
  }

  /* Per-mood accent colours on hover/active */
  .mood-btn[data-mood="flowing"]::before  { background: radial-gradient(ellipse at 50% 120%, rgba(77,184,150,0.18), transparent 70%); }
  .mood-btn[data-mood="clear"]::before    { background: radial-gradient(ellipse at 50% 120%, rgba(232,184,122,0.18), transparent 70%); }
  .mood-btn[data-mood="drifting"]::before { background: radial-gradient(ellipse at 50% 120%, rgba(168,159,232,0.15), transparent 70%); }
  .mood-btn[data-mood="restless"]::before { background: radial-gradient(ellipse at 50% 120%, rgba(220,100,80,0.16), transparent 70%); }

  .mood-btn:hover::before, .mood-btn.selected::before { opacity: 1; }

  .mood-btn:hover {
    border-color: rgba(160,148,240,0.25);
    background: rgba(255,255,255,0.06);
    transform: translateY(-1px);
  }

  .mood-btn.selected {
    border-color: rgba(160,148,240,0.5);
    background: rgba(123,111,208,0.12);
    transform: translateY(-1px);
  }

  .mood-emoji {
    font-size: 26px;
    line-height: 1;
    position: relative;
    z-index: 1;
  }

  .mood-label {
    font-size: 12px;
    letter-spacing: 0.06em;
    color: rgba(192,189,232,0.55);
    font-weight: 400;
    position: relative;
    z-index: 1;
    transition: color 0.2s;
  }

  .mood-btn:hover .mood-label,
  .mood-btn.selected .mood-label {
    color: rgba(200,190,255,0.9);
  }

  /* ── Text expansion ── */
  .nota-reveal {
    width: 100%;
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition: max-height 0.55s var(--ease-breath), opacity 0.5s ease;
  }

  .nota-reveal.open {
    max-height: 220px;
    opacity: 1;
  }

  .nota-trigger {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
    letter-spacing: 0.07em;
    color: rgba(160,148,240,0.5);
    font-family: var(--font-ui);
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 0;
    margin-bottom: 1.4rem;
    display: block;
    width: 100%;
    text-align: center;
    transition: color 0.18s;
  }

  .nota-trigger:hover { color: rgba(168,159,232,0.85); }

  .nota-box {
    width: 100%;
    background: rgba(255,255,255,0.03);
    border: 0.5px solid rgba(160,148,240,0.2);
    border-radius: 14px;
    padding: 14px 16px;
    font-size: 13px;
    font-family: var(--font-ui);
    font-weight: 300;
    color: rgba(192,189,232,0.85);
    resize: none;
    outline: none;
    letter-spacing: 0.02em;
    line-height: 1.6;
    transition: border-color 0.2s;
    min-height: 90px;
    margin-bottom: 10px;
  }

  .nota-box::placeholder { color: rgba(192,189,232,0.22); }
  .nota-box:focus { border-color: rgba(160,148,240,0.45); }

  /* ── Submit button ── */
  .feedback-submit {
    width: 100%;
    padding: 12px 0;
    border-radius: 30px;
    border: 0.5px solid rgba(123,111,208,0.45);
    background: rgba(123,111,208,0.14);
    color: rgba(200,190,255,0.9);
    font-size: 12px;
    font-family: var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.2s ease-out;
  }

  .feedback-submit:hover {
    background: rgba(123,111,208,0.26);
    border-color: rgba(123,111,208,0.7);
  }

  /* ── Skip link ── */
  .feedback-skip {
    margin-top: 1.4rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: rgba(192,189,232,0.2);
    font-family: var(--font-ui);
    transition: color 0.18s;
  }

  .feedback-skip:hover { color: rgba(192,189,232,0.5); }

  /* ── Thank-you state ── */
  .thankyou-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    animation: glyph-in 0.8s var(--ease-breath) forwards;
  }

  .thankyou-glyph { font-size: 32px; opacity: 0.75; }

  .thankyou-title {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 300;
    color: rgba(235,232,255,0.88);
    text-align: center;
    letter-spacing: 0.02em;
    margin-top: 0.4rem;
  }

  .thankyou-sub {
    font-size: 12px;
    letter-spacing: 0.06em;
    color: var(--ghost);
    text-align: center;
    margin-bottom: 1.8rem;
  }

  .new-session-btn {
    padding: 11px 32px;
    border-radius: 30px;
    border: 0.5px solid rgba(123,111,208,0.4);
    background: rgba(123,111,208,0.12);
    color: rgba(200,190,255,0.85);
    font-size: 12px;
    font-family: var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.2s ease-out;
  }

  .new-session-btn:hover {
    background: rgba(123,111,208,0.24);
    border-color: rgba(123,111,208,0.65);
  }

  /* ════════════════════════════════════════════════════════════════════
     PWA INSTALL BANNER
  ════════════════════════════════════════════════════════════════════ */
  .install-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    margin-bottom: 1.25rem;
    border-radius: 16px;
    background: rgba(123,111,208,0.12);
    border: 0.5px solid rgba(123,111,208,0.3);
    animation: glyph-in 0.6s var(--ease-breath) forwards;
  }

  .install-banner-text {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: rgba(200,190,255,0.8);
    line-height: 1.4;
  }

  .install-banner-btn {
    flex-shrink: 0;
    padding: 7px 16px;
    border-radius: 20px;
    border: 0.5px solid rgba(123,111,208,0.5);
    background: rgba(123,111,208,0.2);
    color: rgba(220,215,255,0.95);
    font-size: 11px;
    font-family: var(--font-ui);
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.18s ease-out;
    white-space: nowrap;
  }

  .install-banner-btn:hover {
    background: rgba(123,111,208,0.35);
    border-color: rgba(123,111,208,0.7);
  }

  .install-banner-close {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(192,189,232,0.25);
    font-size: 16px;
    padding: 2px 4px;
    transition: color 0.18s;
    line-height: 1;
  }

  .install-banner-close:hover {
    color: rgba(192,189,232,0.6);
  }
`;

export default css;