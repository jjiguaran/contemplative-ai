import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { captureEvent } from '../../../posthog';
import { MeditationLogEntry, MoodId } from '../../../shared/types/types';
import { MOOD_OPTIONS } from '../../../shared/constants/constants';
import { IconInstagram, IconTikTok, IconFacebook, IconYouTube } from '../../../shared/utils/icons';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY!
);

/* ─── Feedback Screen ───────────────────────────────────────────────── */
interface FeedbackScreenProps {
  visible: boolean;
  completedEntry: MeditationLogEntry | null;
  onDone: () => void;
  onNewSession: () => void;
}

export default function FeedbackScreen({ visible, completedEntry, onDone, onNewSession }: FeedbackScreenProps) {
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleMoodSelect = (mood: MoodId) => {
    setSelectedMood(mood);
    captureEvent('session_feedback_mood', {
      mood,
      duration: completedEntry?.duration ?? undefined,
      level: completedEntry?.level ?? undefined,
      music: completedEntry?.music ?? undefined,
      variation: completedEntry?.variation ?? undefined,
    });
    setTimeout(() => textareaRef.current?.focus(), 300);
  };

  const handleSubmit = async () => {
    if (!selectedMood) return;
    setSaving(true);
    try {
      await supabase.from('session_feedback').insert({
        mood: selectedMood,
        nota: nota.trim() || null,
        duration: completedEntry?.duration ?? null,
        level: completedEntry?.level ?? null,
        music: completedEntry?.music ?? null,
        variation: completedEntry?.variation ?? null,
      });
      captureEvent('session_feedback_submitted', {
        mood: selectedMood ?? undefined,
        has_nota: nota.trim().length > 0,
        duration: completedEntry?.duration ?? undefined,
        level: completedEntry?.level ?? undefined,
        music: completedEntry?.music ?? undefined,
        variation: completedEntry?.variation ?? undefined,
      });
    } catch (err) {
      console.error('Feedback save failed:', err);
    } finally {
      setSaving(false);
      onDone();
    }
  };

  useEffect(() => {
    if (visible) {
      setSelectedMood(null);
      setNota('');
      setSaving(false);
    }
  }, [visible]);

  return (
    <div className={`feedback-wrap${visible ? ' visible' : ''}`}>
      <div className="feedback-card">
        <div className="session-end-glyph">◎</div>
        <h2 className="feedback-title">Sesión completa</h2>
        <p className="feedback-subtitle">¿Cómo fue tu práctica?</p>

        <div className="mood-grid">
          {MOOD_OPTIONS.map(({ id, emoji, label }) => (
            <button
              key={id}
              className={`mood-btn${selectedMood === id ? ' selected' : ''}`}
              data-mood={id}
              onClick={() => handleMoodSelect(id)}
            >
              <span className="mood-emoji">{emoji}</span>
              <span className="mood-label">{label}</span>
            </button>
          ))}
        </div>

        <div className={`nota-reveal${selectedMood ? ' open' : ''}`}>
          <textarea
            ref={textareaRef}
            className="nota-box"
            placeholder="Lo que surgió, lo que sentiste, lo que necesitás recordar…"
            value={nota}
            onChange={e => setNota(e.target.value)}
            rows={3}
          />
        </div>

        {selectedMood && (
          <button className="feedback-submit" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        )}

        <button className="feedback-skip" onClick={onNewSession}>
          Omitir · nueva sesión
        </button>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '24px',
          marginTop: '1.5rem',
        }}>
          {[
            { href: 'https://www.instagram.com/bhavanaapp/', Icon: IconInstagram, label: 'Instagram' },
            { href: 'https://www.tiktok.com/@bhavanaapp',   Icon: IconTikTok,    label: 'TikTok' },
            { href: 'https://www.facebook.com/profile.php?id=61590964273861',  Icon: IconFacebook,  label: 'Facebook' },
            { href: 'https://www.youtube.com/@Bhavanaapp',   Icon: IconYouTube,   label: 'YouTube' },
          ].map(({ href, Icon, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              style={{
                color: 'rgba(192,189,232,0.2)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s ease',
                width: '25px',
                height: '25px',
              }}
              onMouseOver={e => { e.currentTarget.style.color = 'rgba(192,189,232,0.5)'; }}
              onMouseOut={e => { e.currentTarget.style.color = 'rgba(192,189,232,0.2)'; }}
            >
              <Icon />
            </a>
          ))}
        </div>
        
      </div>
    </div>
  );
}