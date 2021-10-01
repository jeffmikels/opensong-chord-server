<template>
  <v-app>
    <v-app-bar app dark dense>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer"></v-app-bar-nav-icon>
      <v-app-bar-title>
        {{ this.$root.$data.appBar.title || this.$route.name || "" }}
        <div
          class="subtitle grey--text text--lighten-1"
          v-if="this.$root.$data.appBar.subtitle"
        >
          {{ this.$root.$data.appBar.subtitle }}
        </div>
      </v-app-bar-title>
      <v-spacer></v-spacer>

      <v-btn
        href="https://github.com/vuetifyjs/vuetify/releases/latest"
        target="_blank"
        text
      >
        <span class="mr-2">Latest Release</span>
        <v-icon>mdi-open-in-new</v-icon>
      </v-btn>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" app temporary>
      <v-list dense nav>
        <v-list-item
          v-for="(item, i) in main_nav"
          :key="i"
          :to="item.link"
          link
        >
          <v-list-item-icon>
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  name: "App",
  data: () => ({
    drawer: null,
    main_nav: [{ icon: "mdi-music-box-multiple", title: "Sets", link: "/sets" }]
  }),
  watch: {
    $route(to, from) {
      this.$root.$data.appBar.title = null;
      this.$root.$data.appBar.subtitle = null;
    }
  }
});
Vue.prototype.$endpoint = "http://localhost:8083";
</script>

<style>
.v-app-bar-title .subtitle {
  font-weight: lighter;
  font-size: 0.7em;
  line-height: 1em;
}
</style>
