const menu = document.querySelector('.menu-btn');
const navigation = document.querySelector('#nav');
function updateMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
  navigation.classList.toggle('open', open);
}
menu.addEventListener('click', () => updateMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    updateMenu(false);
    menu.focus();
  }
});
