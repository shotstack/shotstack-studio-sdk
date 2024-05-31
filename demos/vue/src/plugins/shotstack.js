import StudioEditor from '../components/StudioEditor.vue';

const loadShotstackScript = (callback) => {
  const existingScript = document.querySelector('script[src="https://js.shotstack.io/studio/0.3.0/shotstack.min.js"]');

  if (!existingScript) {
    const script = document.createElement('script');
    script.src = 'https://js.shotstack.io/studio/0.3.0/shotstack.min.js';
    script.async = true;
    script.onload = () => {
      if (window.shotstack) {
        callback();
      } else {
        console.error('Shotstack is not available');
      }
    };
    script.onerror = () => {
      console.error('Failed to load the Shotstack script');
    };
    document.body.appendChild(script);
  } else {
    callback();
  }
};

const Plugin = {
  install(app) {
    app.component('StudioEditor', StudioEditor);
  },
};

export default Plugin;
export { loadShotstackScript, StudioEditor };
