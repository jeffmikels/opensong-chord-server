import Vue from 'vue'
import App from './App.vue'
import './registerServiceWorker'
import router from './router'
import vuetify from './plugins/vuetify'

Vue.config.productionTip = false

const appBar = {
  title: null,
  subtitle: null,
  buttons: []
}

new Vue({
  router,
  vuetify,
  render: h => h(App),
  data: {
    appBar
  }
}).$mount('#app')
