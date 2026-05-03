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

// ---------- TESTIMONIALS DATA ----------
const testimonials = [
  { name: "Priya Sharma", institution: "University of Nairobi", rating: 5, text: "Found a tutor within hours! My grades have improved drastically.", img: "https://randomuser.me/api/portraits/women/11.jpg" },
  { name: "James Omondi", institution: "Kenyatta University", rating: 4.8, text: "The smart preview feature helped me choose the right document.", img: "https://randomuser.me/api/portraits/men/12.jpg" },
  { name: "Aisha Diallo", institution: "University of Cape Town", rating: 5, text: "Secure payments and wallet system is seamless.", img: "https://randomuser.me/api/portraits/women/13.jpg" },
  { name: "Carlos Mwangi", institution: "Strathmore University", rating: 4.9, text: "Tutors are highly professional. Love the live chat.", img: "https://randomuser.me/api/portraits/men/14.jpg" },
  { name: "Zoe Chen", institution: "National University of Singapore", rating: 5, text: "Excellent library with thousands of resources.", img: "https://randomuser.me/api/portraits/women/15.jpg" },
  { name: "Liam van der Merwe", institution: "University of Johannesburg", rating: 4.7, text: "Quick responses and affordable pricing.", img: "https://randomuser.me/api/portraits/men/16.jpg" },
  { name: "Fatima Al-Mansoori", institution: "American University in Cairo", rating: 5, text: "Helped me with my thesis. Highly recommend.", img: "https://randomuser.me/api/portraits/women/17.jpg" },
  { name: "Kwame Asante", institution: "University of Ghana", rating: 4.8, text: "The platform is intuitive and student-friendly.", img: "https://randomuser.me/api/portraits/men/18.jpg" },
  { name: "Emily Wang", institution: "University of Hong Kong", rating: 5, text: "I unlocked a study guide and aced my exam.", img: "https://randomuser.me/api/portraits/women/19.jpg" },
  { name: "Mateo Rodriguez", institution: "University of Melbourne", rating: 4.9, text: "Tutors explain concepts clearly. Great experience.", img: "https://randomuser.me/api/portraits/men/20.jpg" },
  { name: "Sofia Rossi", institution: "University of Edinburgh", rating: 5, text: "Safe, fast, and reliable. Love the wallet funding.", img: "https://randomuser.me/api/portraits/women/21.jpg" },
  { name: "Oliver Schmidt", institution: "Imperial College London", rating: 4.8, text: "The chat with tutors is a lifesaver before exams.", img: "https://randomuser.me/api/portraits/men/22.jpg" },
  { name: "Nina Patel", institution: "University of Oxford", rating: 5, text: "Brilliant platform for busy students.", img: "https://randomuser.me/api/portraits/women/23.jpg" },
  { name: "David Kimani", institution: "Jomo Kenyatta University", rating: 4.7, text: "Affordable and high-quality tutoring.", img: "https://randomuser.me/api/portraits/men/24.jpg" },
  { name: "Leila Haddad", institution: "University of Lagos", rating: 5, text: "The document preview feature is very helpful.", img: "https://randomuser.me/api/portraits/women/25.jpg" },
  { name: "Hiroshi Tanaka", institution: "University of Tokyo", rating: 4.9, text: "I always get answers within 24 hours.", img: "https://randomuser.me/api/portraits/men/26.jpg" },
  { name: "Chloe Dubois", institution: "University of Cambridge", rating: 5, text: "StudyGlade made studying abroad much easier.", img: "https://randomuser.me/api/portraits/women/27.jpg" },
  { name: "Mohammed Ali", institution: "University of Nairobi", rating: 4.8, text: "Great support team and easy withdrawals for tutors.", img: "https://randomuser.me/api/portraits/men/28.jpg" },
  { name: "Isabella Santos", institution: "University of São Paulo", rating: 5, text: "The search bar finds exactly what I need.", img: "https://randomuser.me/api/portraits/women/29.jpg" },
  { name: "Ethan Brown", institution: "Harvard University", rating: 4.9, text: "I recommend StudyGlade to all my classmates.", img: "https://randomuser.me/api/portraits/men/30.jpg" }
];

// Build testimonials cards
const testimonialContainer = document.getElementById('testimonialContainer');
if (testimonialContainer) {
  testimonials.forEach(t => {
    const fullStars = Math.floor(t.rating);
    const halfStar = t.rating % 1 !== 0;
    let starsHtml = '';
    for (let i = 0; i < fullStars; i++) starsHtml += '<i class="fas fa-star"></i>';
    if (halfStar) starsHtml += '<i class="fas fa-star-half-alt"></i>';
    const card = document.createElement('div');
    card.className = 'testimonial-card';
    card.innerHTML = `
      <div style="display:flex; gap:0.8rem;"><img src="${t.img}" alt="${t.name}"><div><strong>${t.name}</strong><div class="testimonial-rating">${starsHtml}</div></div></div>
      <div class="testimonial-text">“${t.text}”</div>
      <div class="testimonial-author">${t.name}</div>
      <div class="testimonial-institution">${t.institution}</div>
    `;
    testimonialContainer.appendChild(card);
  });
}

// ---------- TESTIMONIAL SLIDER ----------
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

// Wait for DOM to be fully loaded before initialising everything
document.addEventListener('DOMContentLoaded', function() {
  initSlider();
});