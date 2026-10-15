// Browser stand-ins for ads and purchases, so the whole game loop can be
// played and tested on a desktop without a device.

function overlay(html) {
  const el = document.createElement('div');
  el.className = 'mock-overlay';
  el.innerHTML = `<div class="mock-box">${html}</div>`;
  document.body.appendChild(el);
  return el;
}

export function mockAd(kind) {
  return new Promise((resolve) => {
    let left = kind === 'rewarded' ? 3 : 2;
    const el = overlay(`<div class="mock-tag">Test ad · ${kind}</div><div class="mock-count">${left}</div>
      <button class="btn mock-close">Close</button>`);
    const count = el.querySelector('.mock-count');
    const timer = setInterval(() => {
      left--;
      count.textContent = left > 0 ? left : 'Done';
      if (left <= 0) {
        clearInterval(timer);
        setTimeout(() => finish(true), 300);
      }
    }, 1000);
    const finish = (earned) => {
      clearInterval(timer);
      el.remove();
      resolve(earned);
    };
    el.querySelector('.mock-close').onclick = () => finish(left <= 0);
  });
}

export function mockConfirm(text) {
  return new Promise((resolve) => {
    const el = overlay(`<div class="mock-tag">Test purchase</div><p>${text}</p>
      <div class="row"><button class="btn" data-v="0">Cancel</button><button class="btn primary" data-v="1">Buy</button></div>`);
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => (el.remove(), resolve(b.dataset.v === '1'))));
  });
}
