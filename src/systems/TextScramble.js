/**
 * Text scramble/decode effect — characters cycle through random glyphs
 * before revealing the final text, like a sci-fi computer terminal.
 */
class TextScramble {
  constructor() {
    this.chars = '!<>-_\\/[]{}—=+*^?#_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    this.queue = [];
    this.frame = 0;
    this.frameRequest = null;
    this.resolve = null;
  }

  /**
   * Animate a DOM element's text content with scramble effect.
   * @param {HTMLElement} el
   * @param {string} newText - Final text to reveal
   * @param {number} duration - Total duration in ms (default 1500)
   * @returns {Promise} resolves when animation is complete
   */
  animate(el, newText, duration = 1500) {
    const oldText = el.innerText;
    const length = Math.max(oldText.length, newText.length);
    const framesPerChar = Math.floor(duration / (16 * length)) + 1;

    this.queue = [];
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || '';
      const to = newText[i] || '';
      const start = Math.floor(Math.random() * (length * 0.4));
      const end = start + framesPerChar + Math.floor(Math.random() * framesPerChar);
      this.queue.push({ from, to, start, end, char: '' });
    }

    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frame = 0;

    return new Promise((resolve) => {
      this.resolve = resolve;
      this._update(el);
    });
  }

  _update(el) {
    let output = '';
    let complete = 0;

    for (let i = 0; i < this.queue.length; i++) {
      const { from, to, start, end } = this.queue[i];
      let char;

      if (this.frame >= end) {
        complete++;
        char = to;
      } else if (this.frame >= start) {
        if (Math.random() < 0.28 || !this.queue[i].char) {
          this.queue[i].char = this.chars[Math.floor(Math.random() * this.chars.length)];
        }
        char = `<span class="scramble-char">${this.queue[i].char}</span>`;
      } else {
        char = from;
      }
      output += char;
    }

    el.innerHTML = output;
    this.frame++;

    if (complete === this.queue.length) {
      if (this.resolve) this.resolve();
    } else {
      this.frameRequest = requestAnimationFrame(() => this._update(el));
    }
  }

  /**
   * Static helper: scramble multiple elements with stagger
   */
  static scrambleElements(elements, staggerMs = 200) {
    const scrambler = new TextScramble();
    const promises = [];

    elements.forEach((el, i) => {
      const text = el.dataset.scrambleText || el.textContent;
      el.dataset.scrambleText = text;

      promises.push(
        new Promise((resolve) => {
          setTimeout(() => {
            scrambler.animate(el, text, 1200).then(resolve);
          }, i * staggerMs);
        })
      );
    });

    return Promise.all(promises);
  }
}

export default TextScramble;
