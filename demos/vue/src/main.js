import { createApp } from 'vue';
import App from './App.vue';
import ShotstackPlugin from './plugins/shotstack';

const app = createApp(App);
app.use(ShotstackPlugin);
app.mount('#app');
