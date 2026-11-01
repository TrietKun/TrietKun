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
          '  play         Launch NIGHTFALL mini-game',
        ];

      case 'whoami':
        return 'Truong Binh Triet - Mobile Developer \u00B7 Flutter';

      case 'skills':
        return [
          'Technical Skills:',
          '  \u2022 Flutter      \u2022 Dart',
          '  \u2022 Riverpod     \u2022 go_router',
          '  \u2022 Flame        \u2022 Kotlin',
          '  \u2022 Android TV   \u2022 ExoPlayer',
          '  \u2022 Firebase     \u2022 REST APIs',
          '  \u2022 Cloudflare Workers',
          '  \u2022 TypeScript   \u2022 Next.js',
          '  \u2022 Git / GitHub Actions',
          '  \u2022 React Native',
        ];

      case 'projects':
        return [
          'Store apps (Triet Digital):',
          '  1. B\u00E1 To\u00E1n 11     App Store',
          '  2. Maneki         App Store, Google Play',
          '  3. Washoku        App Store',
          '  4. S\u1ED5 T\u00E0i S\u1EA3n    App Store, Google Play',
          '',
          'Open source:',
          '  5. MindForge      github.com/TrietKun/Mindforge',
          '  6. CineVerse      github.com/TrietKun/Cineverse',
          '  7. L\u1ECBch Vi\u1EC7t      github.com/TrietKun/lich-viet',
        ];

      case 'contact':
        return [
          '{',
          '  "email": "truongbinhtriet110202@gmail.com",',
          '  "phone": "039 988 9692",',
          '  "github": "github.com/TrietKun",',
          '  "location": "Ho Chi Minh City, Vietnam"',
          '}',
        ];

      case 'education':
        return [
          'Education:',
          '  Industrial University of Ho Chi Minh City (IUH)',
          '  Software Engineering',
          '  2020 to 2025',
        ];

      case 'experience':
        return [
          'Experience:',
          '  1. Workflow - Mobile Developer (10/2025 to present)',
          '     - Customer app (Flutter) for a booking and coworking platform',
          '     - Android TV signage and screen casting app (Kotlin)',
          '     - Web booking site and landing pages for a booking chain',
          '',
          '  2. DevStation - Mobile Developer Intern (06/2025 to 09/2025)',
          '     - Smart Farm IoT: real-time telemetry, ESP32 firmware,',
          '       ThingsBoard integration, scalable device hierarchy',
          '',
          '  3. Digital for Life - Mobile Developer Intern (08/2024 to 05/2025)',
          '     - SOD features, state flow optimization, build stability',
          '       improvements across Android & iOS',
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
          return 'ACCESS GRANTED. Sending hire request... Just kidding! But seriously, let\'s connect: truongbinhtriet110202@gmail.com';
        }
        return `Command not found: sudo ${args.join(' ')}. Type 'help' for available commands.`;

      case 'ls':
        return 'contact.json  education.txt  experience.txt';

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
        return 'Launching NIGHTFALL...';

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
