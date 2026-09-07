import { useEffect, useRef } from 'react';

/**
 * The admin Copilot (ADR 030) answers some questions by *taking* the user
 * somewhere rather than describing it: it emits a `b2b_tool_call` event with
 * `navigate_to`, and this turns that into a real view change.
 */
export function useCopilotNavigation(navigate) {
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const handleCopilotTool = (e) => {
      const { name, args } = e.detail;
      if (name === 'navigate_to' && args?.page) {
        navigateRef.current(args.page.toLowerCase());
      }
    };
    window.addEventListener('b2b_tool_call', handleCopilotTool);
    return () => window.removeEventListener('b2b_tool_call', handleCopilotTool);
  }, []);
}

export default useCopilotNavigation;
