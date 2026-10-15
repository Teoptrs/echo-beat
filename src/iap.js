// Google Play Billing through cordova-plugin-purchase (works inside Capacitor).
// In a desktop browser purchases are simulated with a confirm dialog.
import { Capacitor } from '@capacitor/core';
import { PRODUCTS } from './config.js';
import { save, persist, addCoins } from './save.js';
import { onAdsRemoved } from './ads.js';
import { mockConfirm } from './mock.js';
import { PREMIUM_INKS } from './inks.js';

const native = Capacitor.isNativePlatform();
let store = null;
let CdvPurchase = null;
let onChange = () => {};

export const productById = (id) => PRODUCTS.find((p) => p.id === id);

export function priceOf(id) {
  const p = store?.get(id);
  return p?.pricing?.price || productById(id)?.fallbackPrice || '';
}

export function owns(id) {
  if (id === 'remove_ads') return save.adsRemoved;
  if (id === 'premium_inks') return save.premiumInks;
  return false;
}

// Credits a purchase. Non-consumables are idempotent; consumables are
// tracked by transaction id so a re-delivered purchase is never paid twice.
function grant(id, txId) {
  const product = productById(id);
  if (!product) return;
  if (id === 'remove_ads') onAdsRemoved();
  else if (id === 'premium_inks') {
    save.premiumInks = true;
    for (const t of PREMIUM_INKS) if (!save.owned.includes(t)) save.owned.push(t);
  } else if (product.coins) {
    if (txId && save.grantedTx.includes(txId)) return;
    if (txId) save.grantedTx = [...save.grantedTx.slice(-50), txId];
    addCoins(product.coins);
  }
  persist();
  onChange(id);
}

function syncOwned() {
  for (const p of PRODUCTS) {
    if (p.type === 'NON_CONSUMABLE' && store.get(p.id)?.owned && !owns(p.id)) grant(p.id);
  }
}

function waitForDeviceReady() {
  return new Promise((resolve) => {
    if (window.CdvPurchase) return resolve();
    document.addEventListener('deviceready', resolve, { once: true });
    setTimeout(resolve, 5000);
  });
}

export async function initIAP(changed) {
  onChange = changed;
  if (!native) return;
  await waitForDeviceReady();
  CdvPurchase = window.CdvPurchase;
  if (!CdvPurchase) return console.warn('Billing plugin missing');
  store = CdvPurchase.store;
  const { ProductType, Platform, LogLevel } = CdvPurchase;
  store.verbosity = LogLevel.WARNING;
  store.register(PRODUCTS.map((p) => ({ id: p.id, type: ProductType[p.type], platform: Platform.GOOGLE_PLAY })));
  store
    .when()
    .approved((tx) => {
      for (const p of tx.products) grant(p.id, tx.transactionId);
      tx.finish();
    })
    .productUpdated(() => onChange())
    .receiptUpdated(() => syncOwned());
  store.error((e) => console.warn('Billing error', e?.code, e?.message));
  await store.initialize([Platform.GOOGLE_PLAY]);
  syncOwned();
  onChange();
}

// Resolves with a short error message, or null on success/cancel.
export async function buy(id) {
  const product = productById(id);
  if (!native) {
    if (await mockConfirm(`Test purchase: ${product.title} for ${product.fallbackPrice}?`)) grant(id, `mock-${Date.now()}`);
    return null;
  }
  const offer = store?.get(id, CdvPurchase.Platform.GOOGLE_PLAY)?.getOffer();
  if (!offer) return 'Store not available right now.';
  const err = await offer.order();
  if (err && err.code !== CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return err.message || 'Purchase failed.';
  return null;
}

export async function restore() {
  if (!store) return;
  await store.restorePurchases();
  syncOwned();
}
