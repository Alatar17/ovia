/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { sanitizeCardHtml } from '../utils/sanitizeHtml';
import { mediaStore } from '../store/mediaStore';

interface CardHtmlRendererProps {
  html: string;
  headword: string;
  className?: string;
}

export const CardHtmlRenderer: React.FC<CardHtmlRendererProps> = ({
  html,
  headword,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const sanitized = useMemo(() => {
    return sanitizeCardHtml(html, headword);
  }, [html, headword]);

  // Resolve local image filenames to IndexedDB Blob Object URLs
  useEffect(() => {
    let isCancelled = false;
    const objectUrlsToRevoke: string[] = [];
    const container = containerRef.current;
    if (!container) return;

    const imgElements = container.querySelectorAll<HTMLImageElement>('img[data-media-name]');
    if (imgElements.length === 0) return;

    imgElements.forEach(async (img) => {
      const mediaName = img.getAttribute('data-media-name');
      if (!mediaName) {
        img.style.display = 'none';
        return;
      }

      try {
        const record = await mediaStore.getMedia(mediaName);
        if (isCancelled) return;

        if (record && record.blob && record.blob.size > 0) {
          const objUrl = URL.createObjectURL(record.blob);
          objectUrlsToRevoke.push(objUrl);
          img.src = objUrl;
          img.style.display = 'block';
        } else {
          // If media file is missing, stay hidden (no broken icon, no placeholder)
          img.style.display = 'none';
        }
      } catch (err) {
        console.warn(`Failed loading image for "${mediaName}":`, err);
        if (!isCancelled) {
          img.style.display = 'none';
        }
      }
    });

    return () => {
      isCancelled = true;
      for (const url of objectUrlsToRevoke) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore
        }
      }
    };
  }, [sanitized]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const soundBtn = target.closest('.sound-play-btn');
    if (soundBtn) {
      e.preventDefault();
      e.stopPropagation();

      const dataFile = soundBtn.getAttribute('data-file') || '';
      const rawDataHeadword = soundBtn.getAttribute('data-headword');
      const textToSpeak = rawDataHeadword ? decodeURIComponent(rawDataHeadword) : headword;

      mediaStore.playSound(dataFile, textToSpeak || headword, (msg) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ovia-notify', {
              detail: { message: msg, type: 'info' },
            })
          );
        }
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`card-html-content select-text ${className}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
};
