document.getElementById('loginForm').addEventListener('submit', function(e){
  e.preventDefault();
  const user = document.getElementById('username').value;
  const pass = document.getElementById('password').value;
  if((user==='admin' && pass==='admin') || (user==='demo' && pass==='demo')){
    window.location.href='main.html';
  } else {
    document.getElementById('loginError').innerText = 'Identifiants incorrects';
  }
});