// ---------- STATS COUNT-UP (Intersection Observer) ----------
const statsSection = document.querySelector('.stats-section');
const counters = document.querySelectorAll('.count');
let counted = false;

function formatNumber(value, target) {
  if (target === 5000000) {
    return (value / 1000000).toFixed(1);
  }
  if (target % 1 !== 0) {
    return value.toFixed(1);
  }
  return Math.floor(value).toLocaleString();
}

function startCountUp() {
  if (counted) return;
  counted = true;
  counters.forEach(counter => {
    const target = parseFloat(counter.getAttribute('data-target'));
    let current = 0;
    const step = target / 70;
    let rafId = null;

    function update() {
      if (current < target) {
        current += step;
        if (current > target) current = target;
        counter.innerText = formatNumber(current, target);
        rafId = requestAnimationFrame(update);
      } else {
        counter.innerText = formatNumber(target, target);
        if (rafId) cancelAnimationFrame(rafId);
      }
    }
    update();
  });
}

if (statsSection) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        startCountUp();
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  observer.observe(statsSection);
}

// ---------- SUBJECT DROPDOWN ----------
const selectWrapper = document.querySelector('.custom-select-wrapper');
const trigger = document.querySelector('.select-trigger');

if (selectWrapper && trigger) {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    selectWrapper.classList.toggle('active');
  });

  const options = document.querySelectorAll('.option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      const selectedText = opt.innerText;
      const selectedIcon = opt.querySelector('i').className;
      const triggerSpan = trigger.querySelector('span');
      const triggerIcon = trigger.querySelector('i:first-child');
      if (triggerSpan) triggerSpan.innerText = selectedText;
      if (triggerIcon) triggerIcon.className = selectedIcon + ' fas';
      selectWrapper.classList.remove('active');
    });
  });

  document.addEventListener('click', (e) => {
    if (!selectWrapper.contains(e.target)) selectWrapper.classList.remove('active');
  });
}

// ---------- CTA REDIRECTS ----------
document.querySelectorAll('.s-tag, .search-btn').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'login.html';
  });
});

const liveLink = document.querySelector('.live-tutor-link');
if (liveLink) {
  liveLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'register.html';
  });
}

// ---------- TESTIMONIALS DATA & SLIDER ----------
const testimonials = [ /* your existing array */ ];

const testimonialContainer = document.getElementById('testimonialContainer');
if (testimonialContainer) {
  testimonials.forEach(t => {
    // (same card creation code)
  });
}

// Slider logic with optional resize handling
let currentIndex = 0;
const sliderContainer = document.querySelector('.testimonial-container');
const allCards = document.querySelectorAll('.testimonial-card');
const wrapper = document.querySelector('.testimonial-slider-wrapper');

let autoInterval = null;

function initSlider() {
  if (!sliderContainer || !allCards.length || !wrapper) return;

  const cardWidth = allCards[0].offsetWidth;
  const gap = 24;
  const cardWithGap = cardWidth + gap;
  const visibleCount = Math.floor(wrapper.offsetWidth / cardWithGap) || 1;
  const maxIndex = Math.max(0, allCards.length - visibleCount);
  currentIndex = Math.min(currentIndex, maxIndex);

  function updateSlider() {
    sliderContainer.style.transform = `translateX(-${currentIndex * cardWithGap}px)`;
  }

  const prevBtn = document.getElementById('prevTestimonial');
  const nextBtn = document.getElementById('nextTestimonial');
  if (prevBtn && nextBtn) {
    prevBtn.onclick = () => {
      currentIndex = currentIndex > 0 ? currentIndex - 1 : maxIndex;
      updateSlider();
    };
    nextBtn.onclick = () => {
      currentIndex = currentIndex < maxIndex ? currentIndex + 1 : 0;
      updateSlider();
    };
  }

  if (autoInterval) clearInterval(autoInterval);
  autoInterval = setInterval(() => {
    currentIndex = currentIndex < maxIndex ? currentIndex + 1 : 0;
    updateSlider();
  }, 6000);

  wrapper.onmouseenter = () => clearInterval(autoInterval);
  wrapper.onmouseleave = () => {
    autoInterval = setInterval(() => {
      currentIndex = currentIndex < maxIndex ? currentIndex + 1 : 0;
      updateSlider();
    }, 6000);
  };

  window.addEventListener('resize', () => {
    const newVisible = Math.floor(wrapper.offsetWidth / cardWithGap) || 1;
    const newMax = Math.max(0, allCards.length - newVisible);
    if (currentIndex > newMax) currentIndex = newMax;
    updateSlider();
  });

  updateSlider();
}

initSlider();