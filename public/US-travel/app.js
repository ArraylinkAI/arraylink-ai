// Flight Booking App Logic

document.addEventListener('DOMContentLoaded', () => {
  // Trip Type Selection
  const tripTypeButtons = document.querySelectorAll('.trip-type button');
  tripTypeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.trip-type button.active').classList.remove('active');
      btn.classList.add('active');
    });
  });

  // Search Button Animation & Action
  const searchBtn = document.querySelector('.search-btn');
  searchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Animate button
    searchBtn.textContent = 'Searching...';
    searchBtn.style.opacity = '0.8';
    
    // Simulate API call/search
    setTimeout(() => {
      alert('Search feature would connect to flight API here! showing available flights...');
      searchBtn.textContent = 'SEARCH';
      searchBtn.style.opacity = '1';
    }, 1500);
  });

  // Date Input Defaults
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('departure').value = today;
  
});
