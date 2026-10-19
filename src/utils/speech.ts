import { SOUNDS } from '../data/readingData';

let currentAudio: HTMLAudioElement | null = null;

/**
 * Stop any active audio and speech synthesis so only one sound plays at a time.
 */
export function stopAllSounds(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {
      console.warn('Error stopping audio:', e);
    }
    currentAudio = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('Error stopping speech synthesis:', e);
    }
  }
}

/**
 * Speaks text using SpeechSynthesis API (en-US).
 */
export function speakText(text: string, rate: number = 0.9): void {
  stopAllSounds();

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis is not supported in this browser.');
    return;
  }

  try {
    const cleanText = text
      .replace(/\[sound:[^\]]+\]/g, '')
      .replace(/\/[^/]+\//g, '') // remove phonetics like /'deı.zi/
      .replace(/<[^>]*>/g, '') // remove HTML tags
      .replace(/\s*-\s*.*$/, '') // remove trailing pronunciation notes like "- deyzi"
      .trim();

    if (!cleanText) return;

    // Fix Chrome bug where speech synthesis gets stuck in paused state
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = rate;

    // Pick an en-US voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const enVoice = voices.find(
        (v) => v.lang === 'en-US' || v.lang.startsWith('en_') || v.lang.startsWith('en-')
      );
      if (enVoice) {
        utterance.voice = enVoice;
      }
    }

    window.speechSynthesis.speak(utterance);

    // Secondary Chrome guard: resume if paused immediately after calling speak
    setTimeout(() => {
      if (
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        window.speechSynthesis.paused
      ) {
        window.speechSynthesis.resume();
      }
    }, 50);
  } catch (err) {
    console.error('Failed to trigger speech synthesis:', err);
  }
}

/**
 * Plays a sound by its filename marker from the sounds map.
 * If file is set, plays with an Audio element; otherwise speaks text with SpeechSynthesis (en-US).
 */
export function playSound(soundFileName: string, fallbackHeadword?: string): void {
  stopAllSounds();

  const entry = SOUNDS[soundFileName];
  if (entry?.file) {
    try {
      const audio = new Audio(entry.file);
      currentAudio = audio;
      audio.onended = () => {
        if (currentAudio === audio) {
          currentAudio = null;
        }
      };
      audio.play().catch((err) => {
        console.warn('Audio playback failed, falling back to speech:', err);
        speakText(entry.text || fallbackHeadword || soundFileName);
      });
      return;
    } catch (err) {
      console.warn('Failed to initialize Audio, falling back to speech:', err);
    }
  }

  // Speak text from map or fallback
  const textToSpeak =
    entry?.text ||
    fallbackHeadword ||
    soundFileName.replace(/\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ');

  speakText(textToSpeak);
}
