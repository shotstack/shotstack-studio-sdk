import { useEffect } from 'react';
import { useShotstack } from './ShotstackContext';

const StudioEditor = ({ owner, interactive, timeline, sidebar, controls, style, template, onUpdateEvent }) => {
  const shotstack = useShotstack();

  useEffect(() => {
    if (!shotstack) return;

    const options = {
      owner,
      controls,
      interactive,
      timeline,
      sidebar,
      style,
    };
    if (shotstack.create) {
      shotstack.create('studio-sdk-editor', template, options);
    } else {
      console.error('Shotstack create method is not available');
    }

    if (shotstack.on) {
      shotstack.on('update', onUpdateEvent);
    } else {
      console.error('Shotstack on method is not available');
    }

    return () => {
      if (shotstack.off) {
        shotstack.off('update', onUpdateEvent);
      } else {
        console.error('Shotstack off method is not available');
      }
    };
  }, [shotstack, interactive, timeline, sidebar, style, template, onUpdateEvent]);

  return <div id="studio-sdk-editor"></div>;
};

export default StudioEditor;
