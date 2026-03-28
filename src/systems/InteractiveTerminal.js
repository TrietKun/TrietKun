import gsap from 'gsap';

class InteractiveTerminal {
  constructor() {
    this.terminalBody = null;
    this.inputLine = null;
    this.inputEl = null;
    this.commandHistory = [];
    this.historyIndex = -1;
    this.maxLines = 50;
    this.isActive = false;
    this.isTyping = false;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onTerminalClick = this._onTerminalClick.bind(this);
  }

  activate() {
    this.terminalBody = document.querySelector('.terminal-body');
    if (!this.terminalBody || this.isActive) return;

    this.isActive = true;

    // Create input line
    this.inputLine = document.createElement('div');
    this.inputLine.className = 'terminal-input-line';
    this.inputLine.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 0;';

    const prompt = document.createElement('span');
    prompt.className = 'terminal-prompt';
    prompt.textContent = '$';
    prompt.style.cssText = 'color:#00ffc8;font-family:monospace;user-select:none;';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'terminal-input';
    this.inputEl.spellcheck = false;
    this.inputEl.autocomplete = 'off';
    this.inputEl.style.cssText = [
      'background:transparent',
      'border:none',
      'outline:none',
      'color:#00ffc8',
      'font-family:"Fira Code",monospace',
      'font-size:inherit',
      'width:100%',
      'caret-color:#00ffc8',
      'caret-shape:block',
      'padding:0',
      'margin:0',
      'cursor:text',
    ].join(';');

    this.inputLine.appendChild(prompt);
    this.inputLine.appendChild(this.inputEl);
    this.terminalBody.appendChild(this.inputLine);

    this.inputEl.addEventListener('keydown', this._onKeyDown);
    this.terminalBody.addEventListener('click', this._onTerminalClick);

    this._focusInput();
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.inputEl) {
      this.inputEl.removeEventListener('keydown', this._onKeyDown);
    }
    if (this.terminalBody) {
      this.terminalBody.removeEventListener('click', this._onTerminalClick);
    }
    if (this.inputLine && this.inputLine.parentNode) {
      this.inputLine.parentNode.removeChild(this.inputLine);
    }

    this.inputLine = null;
    this.inputEl = null;
    this.terminalBody = null;
  }

  _onTerminalClick() {
    this._focusInput();
  }

  _focusInput() {
    if (this.inputEl) {
      this.inputEl.focus();
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Enter') {
      const cmd = this.inputEl.value.trim();
      if (!cmd) return;

      this.commandHistory.push(cmd);
      if (this.commandHistory.length > this.maxLines) {
        this.commandHistory.shift();
      }
      this.historyIndex = this.commandHistory.length;

      this._addCommandLine(cmd);
      this.inputEl.value = '';

      const output = this._processCommand(cmd);
      if (output !== null) {
        const lines = Array.isArray(output) ? output : [output];
        this._addOutput(lines);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.inputEl.value = this.commandHistory[this.historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
        this.inputEl.value = this.commandHistory[this.historyIndex];
      } else {
        this.historyIndex = this.commandHistory.length;
        this.inputEl.value = '';
      }
    }
  }

  _addCommandLine(cmd) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.style.cssText = 'color:#00ffc8;font-family:monospace;padding:1px 0;';
    line.textContent = `$ ${cmd}`;
    this.terminalBody.insertBefore(line, this.inputLine);
    this._trimLines();
  }

  _processCommand(raw) {
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        return [
          'Available commands:',
          '  help         Show this help message',
          '  whoami       Display user identity',
          '  skills       List technical skills',
          '  projects     List portfolio projects',
          '  contact      Show contact information',
          '  education    Show education background',
          '  experience   Show work experience',
          '  clear        Clear terminal output',
          '  echo [text]  Echo back text',
          '  date         Show current date/time',
          '  ls           List directories and files',
          '  cat [file]   View file contents',
          '  neofetch     Show system info',
          '  sudo hire-me ???',
          '  play         Launch CYBER SWARM mini-game',
        ];

      case 'whoami':
        return 'Truong Binh Triet \u2014 Mobile Developer (Flutter & React Native)';

      case 'skills':
        return [
          'Technical Skills:',
          '  \u2022 Flutter      \u2022 Dart',
          '  \u2022 React Native \u2022 Firebase',
          '  \u2022 ESP32        \u2022 MQTT',
          '  \u2022 Git          \u2022 REST API',
          '  \u2022 WebSocket    \u2022 Riverpod',
        ];

      case 'projects':
        return [
          'Projects:',
          '  1. Workflow App',
          '  2. Bluetooth Scanner',
          '  3. Smart Home IoT',
          '  4. Portfolio Website',
          '  5. Chat Application',
          '  6. E-Commerce Mobile',
        ];

      case 'contact':
        return [
          '{',
          '  "email": "truongbinhtriet110202@gmail.com",',
          '  "phone": "+84 XXX XXX XXX",',
          '  "github": "github.com/truongbinhtriet",',
          '  "location": "Ho Chi Minh City, Vietnam"',
          '}',
        ];

      case 'education':
        return [
          'Education:',
          '  Industrial University of Ho Chi Minh City (IUH)',
          '  Software Engineering',
          '  2020 - 2025',
        ];

      case 'experience':
        return [
          'Experience:',
          '  1. Mobile Developer Intern @ Workflow',
          '     - Flutter & Dart development',
          '     - IoT integration with ESP32/MQTT',
          '',
          '  2. Mobile Developer Intern @ Previous Company',
          '     - React Native development',
          '     - REST API integration',
        ];

      case 'clear':
        this._clearTerminal();
        return null;

      case 'echo':
        return args.length > 0 ? args.join(' ') : '';

      case 'date':
        return new Date().toString();

      case 'sudo':
        if (args.join(' ').toLowerCase() === 'hire-me') {
          return '\uD83C\uDF89 ACCESS GRANTED \u2014 Sending hire request... Just kidding! But seriously, let\'s connect: truongbinhtriet110202@gmail.com';
        }
        return `Command not found: sudo ${args.join(' ')}. Type 'help' for available commands.`;

      case 'ls':
        return 'about/  projects/  skills/  contact.json  education.txt  experience.txt';

      case 'cat':
        return this._handleCat(args[0]);

      case 'neofetch':
        return [
          '        .--.         triet@portfolio',
          '       |o_o |        ----------------',
          '       |:_/ |        OS: Portfolio v1.0',
          '      //   \\ \\       Host: Triet Truong',
          '     (|     | )      Kernel: JavaScript ES2024',
          '    /\'\\_   _/`\\      Shell: zsh',
          '    \\___)=(___/      Theme: Cyberpunk',
          '                     Terminal: InteractiveTerminal.js',
          '                     CPU: Fueled by Coffee',
          '                     Memory: Unlimited Curiosity',
        ];

      case 'play':
      case 'game':
        window.open(import.meta.env.BASE_URL + 'game.html', '_self');
        return 'Launching CYBER SWARM...';

      case 'rm':
        if (args.join(' ') === '-rf /') {
          return 'Nice try \uD83D\uDE0F Permission denied.';
        }
        return `Command not found: ${raw}. Type 'help' for available commands.`;

      default:
        return `Command not found: ${cmd}. Type 'help' for available commands.`;
    }
  }

  _handleCat(file) {
    if (!file) return 'cat: missing file operand';

    switch (file) {
      case 'contact.json':
        return this._processCommand('contact');
      case 'education.txt':
        return this._processCommand('education');
      case 'experience.txt':
        return this._processCommand('experience');
      default:
        return `cat: ${file}: No such file or directory`;
    }
  }

  _clearTerminal() {
    if (!this.terminalBody) return;
    const children = Array.from(this.terminalBody.children);
    children.forEach((child) => {
      if (child !== this.inputLine) {
        this.terminalBody.removeChild(child);
      }
    });
  }

  async _addOutput(lines, typewriter = true) {
    this.isTyping = true;
    this.inputEl.disabled = true;

    for (const text of lines) {
      const line = document.createElement('div');
      line.className = 'terminal-line terminal-output';
      line.style.cssText = 'color:#b0b0b0;font-family:monospace;padding:1px 0;white-space:pre;';
      this.terminalBody.insertBefore(line, this.inputLine);

      if (typewriter && text.length > 0) {
        await this._typewriterLine(line, text, 20);
      } else {
        line.textContent = text;
      }

      this._scrollToBottom();
    }

    this._trimLines();
    this.isTyping = false;
    this.inputEl.disabled = false;
    this._focusInput();
  }

  _typewriterLine(el, text, speed = 20) {
    return new Promise((resolve) => {
      let i = 0;
      const interval = setInterval(() => {
        el.textContent += text[i];
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          resolve();
        }
      }, speed);
    });
  }

  _scrollToBottom() {
    if (this.terminalBody) {
      this.terminalBody.scrollTop = this.terminalBody.scrollHeight;
    }
  }

  _trimLines() {
    if (!this.terminalBody) return;
    const lines = this.terminalBody.querySelectorAll('.terminal-line');
    while (lines.length > this.maxLines) {
      const oldest = lines[0];
      if (oldest && oldest.parentNode) {
        oldest.parentNode.removeChild(oldest);
      }
      break;
    }
  }
}

export default InteractiveTerminal;
