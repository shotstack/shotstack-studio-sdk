import { debounce } from 'lodash-es';
import { useCallback, useEffect } from 'react';

const StudioEditor = ({ interactive, timeline, style, template }) => {
  useEffect(() => {
    const options = {
      interactive,
      timeline,
      style,
    };
    const script = document.createElement('script');
    script.src = 'https://js.shotstack.io/studio/0.3.0/shotstack.min.js';
    script.async = true;
    script.onload = () => {
      if (window.shotstack) {
        window.shotstack.create('studio-sdk-editor', template, options);
      }
    };

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const debouncedLoadTemplate = useCallback(
    debounce((newTemplate) => {
      if (window.shotstack) {
        window.shotstack.load('studio-sdk-editor', newTemplate, {});
      }
    }, 100),
    []
  );

  useEffect(() => {
    debouncedLoadTemplate(template);
  }, [template, debouncedLoadTemplate]);

  useEffect(() => {
    const options = {
      interactive,
      timeline,
      style,
    };
    if (window.shotstack) {
      window.shotstack.refresh('studio-sdk-editor', options);
    }
  }, [interactive, timeline, style]);

  return <div id="studio-sdk-editor"></div>;
};

export default StudioEditor;
