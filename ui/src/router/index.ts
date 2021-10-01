import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'
import Home from '../views/Home.vue'

Vue.use(VueRouter)

const routes: Array<RouteConfig> = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/sets',
    name: 'Sets',
    component: () => import(/* webpackChunkName: "sets" */ '../views/Sets.vue')
  },
  {
    path: '/set',
    name: 'Set',
    component: () => import(/* webpackChunkName: "set" */ '../views/Set.vue')
  }
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

export default router
