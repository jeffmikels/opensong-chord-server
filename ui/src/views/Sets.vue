<template>
  <v-list subheader nav>
    <v-list-item-group>
      <template v-for="(set, index) in sets">
        <v-list-item two-line :key="set.path" :to="setLink(set)">
          <v-list-item-avatar>
            <v-icon> mdi-folder-music </v-icon>
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title>{{ set.name }}</v-list-item-title>

            <v-list-item-subtitle>{{
              cleanDate(set.time / 1000)
            }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
        <v-divider v-if="index < sets.length - 1" :key="index"></v-divider>
      </template>
    </v-list-item-group>
  </v-list>
</template>

<script lang="ts">
import Vue from "vue";
import axios from "axios";
import { DateTime } from "luxon";

export default Vue.extend({
  name: "Sets",
  created() {
    this.getSets();
  },
  data: () => ({
    sets: [],
  }),
  methods: {
    getSets() {
      const url = `${this.$endpoint}/Sets`;
      this.debug = "loading";
      axios
        .get(url)
        .then((res) => {
          console.log(res);
          this.sets = res.data.files;
          this.sets.sort((a, b) => b.time - a.time);
          this.debug = "";
        })
        .catch((err) => {
          console.log(err);
        });
    },
    cleanDate: (time) => {
      return DateTime.fromSeconds(parseInt(time)).toFormat("MMMM dd, yyyy");
    },
    setLink: (set) => {
      return `/set?path=${set.path}`;
    },
  },
});
</script>
