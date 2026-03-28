/**
 * Draws animated connection lines between skill nodes
 * on a 2D canvas overlay
 */
class SkillsNetwork {
  constructor() {
    this.canvas = document.getElementById('skills-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.connections = [];
    this.time = 0;
    this.active = false;

    this._defineConnections();
  }

  _defineConnections() {
    // Define which skills connect
    this.connectionMap = [
      ['flutter', 'dart'],
      ['flutter', 'firebase'],
      ['flutter', 'ble'],
      ['dart', 'iot'],
      ['iot', 'mqtt'],
      ['iot', 'embedded'],
      ['iot', 'ble'],
      ['embedded', 'ble'],
      ['firebase', 'mqtt'],
      ['flutter', 'git'],
    ];
  }

  activate() {
    this.active = true;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  deactivate() {
    this.active = false;
  }

  _resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.offsetWidth;
    this.canvas.height = parent.offsetHeight;
  }

  _getNodePositions() {
    const nodes = document.querySelectorAll('.skill-node');
    const positions = {};
    const parentRect = this.canvas?.parentElement?.getBoundingClientRect();
    if (!parentRect) return positions;

    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      const skill = node.dataset.skill;
      positions[skill] = {
        x: rect.left - parentRect.left + rect.width / 2,
        y: rect.top - parentRect.top + rect.height / 2,
      };
    });

    return positions;
  }

  update(time) {
    if (!this.active || !this.ctx || !this.canvas) return;

    this.time = time;
    const positions = this._getNodePositions();

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.connectionMap.forEach(([a, b], i) => {
      const posA = positions[a];
      const posB = positions[b];
      if (!posA || !posB) return;

      // Animated pulse along line
      const pulse = (Math.sin(time * 2 + i * 0.8) * 0.5 + 0.5);
      const alpha = 0.08 + pulse * 0.08;

      this.ctx.beginPath();
      this.ctx.moveTo(posA.x, posA.y);
      this.ctx.lineTo(posB.x, posB.y);
      this.ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      // Moving dot along line
      const t = (Math.sin(time * 1.5 + i * 1.2) * 0.5 + 0.5);
      const dotX = posA.x + (posB.x - posA.x) * t;
      const dotY = posA.y + (posB.y - posA.y) * t;

      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(0, 212, 255, ${0.3 + pulse * 0.4})`;
      this.ctx.fill();
    });
  }
}

export default SkillsNetwork;
