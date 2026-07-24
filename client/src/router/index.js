import { createRouter, createWebHistory } from 'vue-router';
import ClientPos from '../pages/ClientPos.vue';
import BillComponent from '../components/BillComponent.vue';
import AuthPos from '../pages/AuthPos.vue';
import PosOwner from '../pages/PosOwner.vue';
import QrLand from '../pages/QrLand.vue';
import KineticPos from '../pages/KineticPos.vue';
import KineticCode from '../pages/KineticCode.vue';
import ShopManager from '../pages/ShopManager.vue';

const routes = [
  {
    path:'/',
    name:'kineticcode',
    component:KineticCode
  },
  {
    path:'/auth',
    name:'auth',
    component:AuthPos
  },
  {
    path:'/posowner',
    name:'posowner',
    component:PosOwner
  },
  {
    path:'/client',
    name:'home',
    component:ClientPos
  },
  {
    path:'/billprint',
    name:'billprint',
    component:BillComponent
  },
  {
    path:'/kineticpos',
    name:'kineticpos',
    component:KineticPos
  },
  {
    path:'/order/:shopId',
    name:'myshop',
    component:QrLand
  },
  // Inside your routes array:
{
  path: '/manager-dashboard',
  name: 'ShopManager',
  component: ShopManager
}
];

export default createRouter({
  history: createWebHistory(),
  routes
});
