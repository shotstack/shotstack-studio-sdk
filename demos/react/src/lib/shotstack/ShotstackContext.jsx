import React, { createContext, useContext, useEffect, useState } from 'react';

const ShotstackContext = createContext();

export const ShotstackProvider = ({ children }) => {
  const [shotstack, setShotstack] = useState(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://js.shotstack.io/studio/0.5.4/shotstack.min.js';
    script.async = true;
    script.onload = () => {
      if (window.shotstack) {
        setShotstack({
          ...window.shotstack,
          load: json => window.shotstack.load('studio-sdk-editor', json),
        });
      }
    };

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return <ShotstackContext.Provider value={shotstack}>{children}</ShotstackContext.Provider>;
};

export const useShotstack = () => {
  return useContext(ShotstackContext);
};
