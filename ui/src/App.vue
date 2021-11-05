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

      <div v-for="button in this.$root.$data.appBar.buttons" :key="button.icon">
        <v-btn @click="button.callback" text>
          <v-icon v-if="button.icon">{{ button.icon }}</v-icon>
          <span class="mr-2" v-if="button.label">{{ button.label }}</span>
        </v-btn>
      </div>
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
      this.$root.$data.appBar.buttons = [];
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

/*scrollbar*/
#app {
  scrollbar-width: none;
} /*firefox*/

::-webkit-scrollbar {
  width: 2px;
  height: 2px;
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #333;
}
</style>
