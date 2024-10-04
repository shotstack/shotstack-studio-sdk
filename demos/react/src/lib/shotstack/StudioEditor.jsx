import { useEffect } from 'react';
import { useShotstack } from './ShotstackContext';

const StudioEditor = ({
  owner,
  interactive,
  timeline,
  sidepanel,
  controls,
  settings,
  style,
  template,
  onUpdateEvent,
  onMetadataEvent,
}) => {
  const shotstack = useShotstack();

  useEffect(() => {
    if (!shotstack) return;

    const options = {
      owner,
      controls,
      interactive,
      timeline,
      settings,
      sidepanel,
      style,
    };
    if (shotstack.create) {
      shotstack.create('studio-sdk-editor', template, options);
    } else {
      console.error('Shotstack create method is not available');
    }

    if (shotstack.on) {
      shotstack.on('update', onUpdateEvent);
      shotstack.on('metadata', onMetadataEvent);
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
  }, [shotstack, interactive, timeline, sidepanel, settings, style, template, onUpdateEvent]);

  return <div id="studio-sdk-editor"></div>;
};

export default StudioEditor;
