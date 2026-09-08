import { useState, useEffect } from 'react';

/**
 * Open/close state for the full-screen assistant preview.
 *
 * This hook used to also run a whole chat session — SSE streaming against
 * /api/chat, its own message list, its own tool-event handling — feeding a
 * second chat UI built inside the dashboard. That work now belongs to the
 * real widget bundle, which public/preview.html injects, so there is exactly
 * one chat implementation in the product. What's left is the modal's own
 * state and the one bit of housekeeping the modal can't do itself.
 */
export default function usePreview() {
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Dorafi runs its own widget on the admin. Leaving it up behind a
  // full-screen preview puts two launchers in the same corner.
  useEffect(() => {
    const adminBot = document.getElementById('b2b-chatbot-host');
    if (adminBot) {
      adminBot.style.display = showPreviewModal ? 'none' : '';
    }
    return () => {
      if (adminBot) adminBot.style.display = '';
    };
  }, [showPreviewModal]);

  return { showPreviewModal, setShowPreviewModal };
}
