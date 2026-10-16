/**
 * Level 2 Order Book Depth & Microstructure Renderer
 */

class OrderBookRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  update(obState) {
    if (!obState || !this.container) return;

    // Update Header Metrics
    const spreadEl = document.getElementById('obSpread');
    const spreadBpsEl = document.getElementById('obSpreadBps');
    const obiEl = document.getElementById('obImbalance');
    const obiFill = document.getElementById('obImbalanceFill');

    if (spreadEl) spreadEl.innerText = `$${obState.spread}`;
    if (spreadBpsEl) spreadBpsEl.innerText = `${obState.spreadBps} bps`;
    if (obiEl) {
      const im = obState.imbalance;
      const formatted = (im * 100).toFixed(1) + '%';
      obiEl.innerText = (im > 0 ? '+' : '') + formatted;
      obiEl.style.color = im > 0 ? '#00f59b' : (im < 0 ? '#ff3366' : '#94a3b8');
    }

    if (obiFill) {
      // Bounds: -1 to +1 mapped to left / right percentage
      const pct = (obState.imbalance + 1) / 2 * 100;
      obiFill.style.left = '0%';
      obiFill.style.width = `${pct}%`;
      obiFill.style.background = obState.imbalance >= 0 ? '#00f59b' : '#ff3366';
    }

    // Render Bids & Asks
    const bidsContainer = document.getElementById('obBidsList');
    const asksContainer = document.getElementById('obAsksList');

    if (!bidsContainer || !asksContainer) return;

    const maxBidTotal = obState.bids.length > 0 ? obState.bids[obState.bids.length - 1].total : 1;
    const maxAskTotal = obState.asks.length > 0 ? obState.asks[obState.asks.length - 1].total : 1;
    const maxTotal = Math.max(maxBidTotal, maxAskTotal);

    // Bids (Highest to lowest)
    bidsContainer.innerHTML = obState.bids.map(b => {
      const depthWidth = ((b.total / maxTotal) * 100).toFixed(1);
      return `
        <div class="ob-row bid">
          <div class="ob-depth-bar" style="width: ${depthWidth}%;"></div>
          <span class="ob-price bid">${b.price.toFixed(2)}</span>
          <span class="ob-size">${b.size.toFixed(4)}</span>
        </div>
      `;
    }).join('');

    // Asks (Lowest to highest)
    asksContainer.innerHTML = obState.asks.map(a => {
      const depthWidth = ((a.total / maxTotal) * 100).toFixed(1);
      return `
        <div class="ob-row ask">
          <div class="ob-depth-bar" style="width: ${depthWidth}%;"></div>
          <span class="ob-price ask">${a.price.toFixed(2)}</span>
          <span class="ob-size">${a.size.toFixed(4)}</span>
        </div>
      `;
    }).join('');
  }
}

window.OrderBookRenderer = OrderBookRenderer;
