<template>
  <div id="studio">
    <button @click="unshiftTrack">Remove First Track</button>
  </div>
</template>

<script>
import { toRaw, reactive, watch } from "vue";
import { loadShotstackScript } from "../plugins/shotstack";

export default {
  name: "StudioEditor",
  props: {
    interactive: {
      type: Boolean,
      required: true,
    },
    timeline: {
      type: Object,
      required: true,
    },
    style: {
      type: Object,
      required: true,
    },
    template: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const template = reactive(props.template);

    const options = {
      interactive: props.interactive,
      timeline: props.timeline,
      style: props.style,
    };

    const initializeShotstack = () => {
      if (window.shotstack) {
        window.shotstack.create("studio", toRaw(template), options);
      } else {
        console.error("Shotstack is not available");
      }
    };

    loadShotstackScript(initializeShotstack);

    watch(
      () => template,
      (newTemplate, oldTemplate) => {
        if (window.shotstack) {
          window.shotstack.load("studio", toRaw(newTemplate));
        }
      },
      { deep: true },
    );

    return {
      template,
      unshiftTrack() {
        if (template.timeline.tracks && template.timeline.tracks.length > 0) {
          template.timeline.tracks.shift();
        } else {
          console.warn("No tracks to remove");
        }
      },
    };
  },
};
</script>
