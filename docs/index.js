// Dynamic year for footer
document.getElementById('currentYear').textContent = new Date().getFullYear();

// FAQ accordion
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
  const question = item.querySelector('.faq-question');
  question.addEventListener('click', () => {
    item.classList.toggle('active');
    const icon = question.querySelector('i');
    if (item.classList.contains('active')) {
      icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
      icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
  });
});

// Testimonial data (realistic profile images)
const testimonialsData = [
  {
    name: "Sarah Johnson",
    role: "Nursing Student",
    university: "University of Toronto",
    text: "Got help with my nursing care plan within 4 hours. The tutor explained everything step‑by‑step instead of just giving answers.",
    rating: 5,
    img: "https://randomuser.me/api/portraits/women/44.jpg"
  },
  {
    name: "Michael Rodriguez",
    role: "Engineering Student",
    university: "UCLA",
    text: "StudyGlade helped me raise my GPA from 2.8 to 3.5. The tutors are incredibly knowledgeable and fast.",
    rating: 5,
    img: "https://randomuser.me/api/portraits/men/32.jpg"
  },
  {
    name: "Emily Chen",
    role: "Computer Science",
    university: "MIT",
    text: "I was stuck on a Python recursion problem. Within 10 minutes I had a clear explanation and working code. Lifesaver!",
    rating: 5,
    img: "https://randomuser.me/api/portraits/women/68.jpg"
  },
  {
    name: "David Kim",
    role: "Business Student",
    university: "NYU",
    text: "The economics tutor broke down GDP vs GNP so clearly. Highly recommend StudyGlade.",
    rating: 5,
    img: "https://randomuser.me/api/portraits/men/45.jpg"
  }
];

function createTestimonialCard(t) {
  const stars = '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating);
  return `
    <div class="testimonial-card">
      <div class="testimonial-header">
        <img src="${t.img}" alt="${t.name}" class="testimonial-avatar" loading="lazy">
        <div>
          <div class="testimonial-name">${t.name}</div>
          <div class="testimonial-role">${t.role}, ${t.university}</div>
        </div>
      </div>
      <div class="stars">${stars}</div>
      <p class="testimonial-text">“${t.text}”</p>
    </div>
  `;
}

const testimonialTrack = document.getElementById('testimonialTrack');
if (testimonialTrack) {
  testimonialsData.forEach(t => {
    testimonialTrack.insertAdjacentHTML('beforeend', createTestimonialCard(t));
  });
}

// Mobile menu toggle (smooth slide-down)
const menuIcon = document.querySelector('.mobile-menu-icon');
const mobilePanel = document.getElementById('mobileMenuPanel');
if (menuIcon && mobilePanel) {
  menuIcon.addEventListener('click', () => {
    mobilePanel.classList.toggle('open');
  });
}

// Count-up animation for trust strip numbers
const trustNumbers = document.querySelectorAll('.trust-number');
let counted = false;

function parseNumberFromText(text) {
  // Extracts numeric value from strings like "150K+", "4.9 ★", "5M+"
  const match = text.match(/[\d.]+/);
  if (!match) return 0;
  let value = parseFloat(match[0]);
  if (text.includes('K')) value *= 1000;
  if (text.includes('M')) value *= 1000000;
  return value;
}

function formatNumber(value, originalText) {
  // Reconstructs the original format (e.g., "150K+", "4.9 ★")
  const hasK = originalText.includes('K');
  const hasM = originalText.includes('M');
  const hasStar = originalText.includes('★');
  const hasPlus = originalText.includes('+');
  
  let displayValue = value;
  if (hasM) displayValue = (value / 1000000).toFixed(1).replace(/\.0$/, '');
  else if (hasK) displayValue = (value / 1000).toFixed(0);
  else displayValue = value.toFixed(hasStar ? 1 : 0);
  
  let result = displayValue.toString();
  if (hasM) result += 'M';
  else if (hasK) result += 'K';
  if (hasStar) result += ' ★';
  if (hasPlus && !hasStar) result += '+';
  return result;
}

function animateNumber(element, start, end, originalText, duration = 1500) {
  const stepTime = 16; // ~60fps
  const steps = duration / stepTime;
  const increment = (end - start) / steps;
  let current = start;
  let step = 0;
  
  const timer = setInterval(() => {
    step++;
    current += increment;
    if (step >= steps) {
      current = end;
      clearInterval(timer);
    }
    const rounded = Math.round(current);
    element.textContent = formatNumber(rounded, originalText);
  }, stepTime);
}

function startCountUp() {
  if (counted) return;
  counted = true;
  
  trustNumbers.forEach(el => {
    const originalText = el.textContent.trim();
    const targetValue = parseNumberFromText(originalText);
    if (targetValue > 0) {
      el.textContent = formatNumber(0, originalText); // start at 0
      animateNumber(el, 0, targetValue, originalText);
    }
  });
}

// Intersection Observer to trigger when trust strip is visible
const trustStrip = document.querySelector('.trust-strip');
if (trustStrip && !counted) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        startCountUp();
        observer.disconnect(); // run only once
      }
    });
  }, { threshold: 0.3 });
  observer.observe(trustStrip);
} else if (trustStrip && !counted) {
  // Fallback: start immediately if already visible
  startCountUp();
}

// Dynamic product mockup content (rotating)
const mockupData = [
  {
    question: "Need help solving integration by parts?",
    tutorName: "Dr. Sarah M.",
    tutorRole: "Mathematics Expert",
    responseTime: "3 min",
    rating: "4.9"
  },
  {
    question: "How do I calculate standard deviation in R?",
    tutorName: "Prof. James K.",
    tutorRole: "Statistics Expert",
    responseTime: "5 min",
    rating: "5.0"
  },
  {
    question: "Nursing care plan for hypertension?",
    tutorName: "RN Lisa T.",
    tutorRole: "Clinical Nursing Instructor",
    responseTime: "2 min",
    rating: "4.8"
  }
];

let mockupIndex = 0;
const mockupQuestion = document.querySelector('.mockup-question');
const mockupTutorName = document.querySelector('.mockup-tutor strong');
const mockupResponse = document.querySelector('.mockup-response');
const mockupRating = document.querySelector('.mockup-rating');

function rotateMockupContent() {
  if (!mockupQuestion || !mockupTutorName || !mockupResponse || !mockupRating) return;
  
  mockupIndex = (mockupIndex + 1) % mockupData.length;
  const data = mockupData[mockupIndex];
  
  // Fade out effect
  const parent = document.querySelector('.product-mockup');
  parent.style.transition = 'opacity 0.2s';
  parent.style.opacity = '0.5';
  
  setTimeout(() => {
    mockupQuestion.textContent = data.question;
    mockupTutorName.textContent = data.tutorName;
    // Update tutor line: "Dr. Sarah M.\nMathematics Expert"
    const tutorLine = document.querySelector('.mockup-tutor');
    tutorLine.innerHTML = `<span class="tick">✓</span> <strong>${data.tutorName}</strong><br>${data.tutorRole}`;
    mockupResponse.textContent = `Response time: ${data.responseTime}`;
    mockupRating.innerHTML = '★★★★★ '.slice(0, data.rating === '4.9' ? 9 : 10) + data.rating;
    
    parent.style.opacity = '1';
  }, 200);
}

// Start rotating every 4 seconds
setInterval(rotateMockupContent, 10000);

const mockupCard = document.querySelector('.product-mockup');
let interval;

function startRotation() {
  interval = setInterval(rotateMockupContent, 10000);
}

function stopRotation() {
  clearInterval(interval);
}

mockupCard.addEventListener('mouseenter', stopRotation);
mockupCard.addEventListener('mouseleave', startRotation);

startRotation();

// Dynamic copyright year (2015 - current)
const yearSpan = document.getElementById('currentYear');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

// Back to Top button functionality
const backToTopBtn = document.getElementById('backToTopBtn');
if (backToTopBtn) {
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}