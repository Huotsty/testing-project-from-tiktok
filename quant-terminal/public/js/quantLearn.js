/**
 * Quant 101 Educational Glossary & Theory Modal
 * Gives beginners an interactive, institutional walkthrough of all core formulas.
 */

class QuantLearn {
  constructor() {
    this.modal = document.getElementById('quantModal');
    this.modalBody = document.getElementById('quantModalContent');
    this.openBtn = document.getElementById('btnOpenQuantLearn');
    this.closeBtn = document.getElementById('btnCloseQuantLearn');

    this.init();
  }

  init() {
    if (this.openBtn) {
      this.openBtn.addEventListener('click', () => this.open());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
    }
  }

  async open() {
    this.modal.classList.add('open');
    if (!this.loaded) {
      try {
        const res = await fetch('/api/glossary');
        const data = await res.json();
        this.renderConcepts(data.concepts);
        this.loaded = true;
      } catch (err) {
        this.modalBody.innerHTML = '<p style="color:#ff3366">Failed to load quant glossary.</p>';
      }
    }
  }

  close() {
    this.modal.classList.remove('open');
  }

  renderConcepts(concepts) {
    if (!concepts || concepts.length === 0) return;
    this.modalBody.innerHTML = concepts.map(c => `
      <div class="concept-card">
        <div class="concept-title">${c.term}</div>
        <div class="concept-domain">${c.domain}</div>
        <div class="concept-formula"><code>${c.formula}</code></div>
        <div class="concept-desc">${c.explanation}</div>
      </div>
    `).join('');
  }
}

window.QuantLearn = QuantLearn;
