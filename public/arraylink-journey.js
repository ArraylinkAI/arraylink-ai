// ==========================================
// ArrayLink.ai Journey UI - JavaScript
// Scroll animations and interactions
// ==========================================

(function () {
    'use strict';

    // ===== CONFIGURATION =====
    const CONFIG = {
        animationThreshold: 0.1,
        navScrollThreshold: 100,
        smoothScrollDuration: 800
    };

    // ===== INTERSECTION OBSERVER FOR SCROLL ANIMATIONS =====
    const observerOptions = {
        threshold: CONFIG.animationThreshold,
        rootMargin: '0px 0px -100px 0px'
    };

    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                // Optional: unobserve after animation to improve performance
                // animationObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // ===== INITIALIZE ANIMATIONS =====
    function initializeAnimations() {
        // Pause all animations initially
        const animatedElements = document.querySelectorAll('.fade-in, .slide-up, .scale-in');
        animatedElements.forEach(el => {
            el.style.animationPlayState = 'paused';
            animationObserver.observe(el);
        });
    }

    // ===== NAVIGATION SCROLL EFFECT =====
    function handleNavScroll() {
        const nav = document.getElementById('nav');
        if (!nav) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > CONFIG.navScrollThreshold) {
                nav.style.background = 'rgba(10, 14, 39, 0.95)';
                nav.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
            } else {
                nav.style.background = 'rgba(10, 14, 39, 0.8)';
                nav.style.boxShadow = 'none';
            }
        });
    }

    // ===== SMOOTH SCROLL FOR NAVIGATION LINKS =====
    function initializeSmoothScroll() {
        const navLinks = document.querySelectorAll('.nav-link, .hero-cta');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');

                // Only handle internal links
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    const targetId = href.substring(1);
                    const targetElement = document.getElementById(targetId);

                    if (targetElement) {
                        targetElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                }
            });
        });
    }

    // ===== PARALLAX EFFECT =====
    function initializeParallax() {
        const heroSection = document.querySelector('.hero');
        if (!heroSection) return;

        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallaxSpeed = 0.5;

            // Apply parallax to hero content
            const heroContent = heroSection.querySelector('.hero-content');
            if (heroContent && scrolled < window.innerHeight) {
                heroContent.style.transform = `translateY(${scrolled * parallaxSpeed}px)`;
                heroContent.style.opacity = 1 - (scrolled / window.innerHeight) * 0.5;
            }
        });
    }

    // ===== CARD TILT EFFECT (OPTIONAL PREMIUM FEATURE) =====
    function initializeCardTilt() {
        const cards = document.querySelectorAll('.card');

        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = (y - centerY) / 20;
                const rotateY = (centerX - x) / 20;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    // ===== GRADIENT ANIMATION =====
    function animateGradients() {
        const gradientElements = document.querySelectorAll('.hero-title, .nav-logo');

        gradientElements.forEach(el => {
            let hue = 0;
            setInterval(() => {
                hue = (hue + 1) % 360;
                // Subtle gradient shift effect
            }, 50);
        });
    }

    // ===== ACTIVE SECTION TRACKING =====
    function initializeActiveSection() {
        const sections = document.querySelectorAll('.section[id]');
        const navLinks = document.querySelectorAll('.nav-link');

        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');

                    // Update active nav link
                    navLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${id}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        }, {
            threshold: 0.3
        });

        sections.forEach(section => sectionObserver.observe(section));
    }

    // ===== PERFORMANCE: DEBOUNCE FUNCTION =====
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ===== LOADING PERFORMANCE =====
    function optimizeImages() {
        // Lazy load images if any are added
        const images = document.querySelectorAll('img[data-src]');

        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    }

    // ===== INITIALIZE ON DOM READY =====
    function init() {
        console.log('🚀 ArrayLink.ai Journey UI initialized');

        // Core features
        initializeAnimations();
        initializeSmoothScroll();
        handleNavScroll();
        initializeActiveSection();

        // Enhanced features
        initializeParallax();
        initializeCardTilt();
        optimizeImages();

        // Performance optimizations
        window.addEventListener('resize', debounce(() => {
            console.log('Window resized - recalculating layouts');
        }, 250));
    }

    // ===== START APPLICATION =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ===== EXPOSURE FOR DEBUGGING =====
    window.ArrayLinkJourney = {
        version: '1.0.0',
        config: CONFIG,
        reinitialize: init
    };

})();
