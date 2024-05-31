<template>
  <StudioEditor
    :interactive="interactive"
    :timeline="timeline"
    :style="style"
    :template="template"
  />
</template>

<script>
import template from "./template/template.json";

export default {
  name: "App",
  data() {
    return {
      interactive: true,
      timeline: true,
      style: {
        primaryColor: "#ff0000",
        secondaryColor: "#0000ff",
      },
      template: template,
    };
  },
};
</script>

<style>
body {
  background-color: antiquewhite;
}
#app {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  margin: 0;
}
#studio {
  width: 75%;
  height: 75vh;
}
</style>
