// Particle Network Animation
const canvas = document.getElementById('neural-network-canvas');
if (canvas) {
    const ctx = canvas.getContext('2d');

    let width, height;
    let particles = [];

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        initParticles();
    }

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 2;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0) this.x = width;
            if (this.x > width) this.x = 0;
            if (this.y < 0) this.y = height;
            if (this.y > height) this.y = 0;
        }

        draw() {
            ctx.fillStyle = 'rgba(0, 243, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        const particleCount = Math.floor(width * height / 15000);
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
        ctx.lineWidth = 1;

        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];
            p.update();
            p.draw();

            for (let j = i; j < particles.length; j++) {
                let p2 = particles[j];
                let dx = p.x - p2.x;
                let dy = p.y - p2.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 100) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize);
    resize();
    animate();
}

// Glitch Text Effect
const glitchText = document.querySelector('.glitch-text');
if (glitchText) {
    setInterval(() => {
        glitchText.classList.add('glitch-active');
        setTimeout(() => glitchText.classList.remove('glitch-active'), 200);
    }, 3000);
}

// Backend server URL (Render.com)
const SERVER_URL = 'https://arraylink-ai.onrender.com';

// Launch Demo Button Functionality
document.addEventListener('DOMContentLoaded', function () {
    // Get all Launch Demo buttons
    const launchDemoButtons = document.querySelectorAll('a[href="#"]');

    launchDemoButtons.forEach(button => {
        if (button.textContent.includes('Launch Demo')) {
            button.addEventListener('click', function (e) {
                e.preventDefault();
                showPhoneNumberModal();
            });
        }
    });
});

// Show modal to get phone number
function showPhoneNumberModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, rgba(10, 5, 32, 0.95), rgba(3, 0, 20, 0.95));
            border: 1px solid rgba(0, 255, 255, 0.2);
            border-radius: 24px;
            padding: 3rem;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0, 255, 255, 0.2);
        ">
            <h2 style="
                font-family: 'Space Grotesk', sans-serif;
                font-size: 2rem;
                margin-bottom: 1rem;
                background: linear-gradient(135deg, #00ffff, #8b5cf6);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            ">Launch Live Demo</h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 2rem;">
                Enter your phone number and we'll call you to demonstrate our AI voice agent.
            </p>
            <input 
                type="tel" 
                id="phoneInput" 
                placeholder="+919876543210"
                style="
                    width: 100%;
                    padding: 1rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    color: white;
                    font-size: 1rem;
                    margin-bottom: 1.5rem;
                "
            />
            <div style="display: flex; gap: 1rem;">
                <button id="callButton" style="
                    flex: 1;
                    padding: 1rem;
                    background: linear-gradient(135deg, #00ffff, #8b5cf6);
                    border: none;
                    border-radius: 50px;
                    color: #000;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 1rem;
                ">Call Me Now</button>
                <button id="cancelButton" style="
                    flex: 1;
                    padding: 1rem;
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 50px;
                    color: white;
                    font-weight: 500;
                    cursor: pointer;
                    font-size: 1rem;
                ">Cancel</button>
            </div>
            <div id="statusMessage" style="
                margin-top: 1rem;
                padding: 1rem;
                border-radius: 12px;
                display: none;
            "></div>
        </div>
    `;

    document.body.appendChild(modal);

    const phoneInput = modal.querySelector('#phoneInput');
    const callButton = modal.querySelector('#callButton');
    const cancelButton = modal.querySelector('#cancelButton');
    const statusMessage = modal.querySelector('#statusMessage');

    callButton.addEventListener('click', async function () {
        const phoneNumber = phoneInput.value.trim();

        if (!phoneNumber) {
            showStatus('Please enter a phone number', 'error');
            return;
        }

        // Disable button and show loading
        callButton.disabled = true;
        callButton.textContent = 'Initiating Call...';

        try {
            const response = await fetch(`${SERVER_URL}/api/make-call`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber })
            });

            const data = await response.json();

            if (response.ok) {
                showStatus('✅ Call initiated! Your phone will ring in a few seconds...', 'success');
                setTimeout(() => {
                    document.body.removeChild(modal);
                }, 3000);
            } else {
                showStatus('❌ ' + (data.error || 'Failed to initiate call'), 'error');
                callButton.disabled = false;
                callButton.textContent = 'Call Me Now';
            }
        } catch (error) {
            showStatus('❌ Network error. Please try again.', 'error');
            callButton.disabled = false;
            callButton.textContent = 'Call Me Now';
        }
    });

    cancelButton.addEventListener('click', function () {
        document.body.removeChild(modal);
    });

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.style.display = 'block';
        statusMessage.style.background = type === 'success'
            ? 'rgba(0, 255, 0, 0.1)'
            : 'rgba(255, 0, 0, 0.1)';
        statusMessage.style.border = type === 'success'
            ? '1px solid rgba(0, 255, 0, 0.3)'
            : '1px solid rgba(255, 0, 0, 0.3)';
        statusMessage.style.color = type === 'success' ? '#00ff00' : '#ff0000';
    }
}

