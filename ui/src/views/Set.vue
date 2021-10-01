<template>
  <songs
    v-if="this.current_set && this.current_set.songs"
    v-bind:songs="this.current_set.songs"
  ></songs>
</template>
<script lang="ts">
import Vue from "vue";
import axios from "axios";
import Songs from "./Songs.vue";

export default Vue.extend({
  name: "Set",
  components: {
    Songs
  },
  mounted() {
    this.path = this.$route.query.path;
    this.getSet();
    this.$root.$data.appBar.title = "View Set";
  },
  data: () => ({
    path: null,
    current_set: null,
    current_song_index: null
  }),
  methods: {
    getSet(setPath, songIndex = 0) {
      const url = `${this.$endpoint}/${this.path}`;
      axios
        .get(url)
        .then(res => {
          console.log(res);
          const songs = res.data.songs;

          // load set-specific transpose and capo settings
          for (var i = 0; i < songs.length; i++) {
            const song = songs[i];
            song.transpose = 0;
            song.capo = 0;
            song.bpm = song.bpm ? song.bpm : 140;
            // for "blank" songs
            if (!song.key) song.bpm = 1;

            let id = `${res.data.path}-${i}-${song.path}-transpose`;
            let t = localStorage.getItem(id);
            if (t !== null) song.transpose = 1 * t;

            id = `${res.data.path}-${i}-${song.path}-capo`;
            t = localStorage.getItem(id);
            if (t !== null) song.capo = 1 * t;

            id = `${res.data.path}-${i}-${song.path}-bpm`;
            t = localStorage.getItem(id);
            if (t !== null) song.bpm = 1 * t;
          }

          this.current_set = res.data;
          this.current_song_index = songIndex;

          this.$root.$data.appBar.title = res.data.name;
          this.$root.$data.appBar.subtitle = "this is a subtitle";
        })
        .catch(err => {
          console.log(err);
        });
    },
    song(index) {
      return this.current_set.songs[index];
    }
  }
});
</script>
