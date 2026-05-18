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