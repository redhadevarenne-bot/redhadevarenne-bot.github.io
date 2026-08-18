import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// StrictMode est volontairement DESACTIVE.
// En developpement, il monte puis demonte puis remonte chaque composant.
// La logique de Pixovery attache ses ecouteurs dans componentDidMount et
// manipule le DOM directement : le double montage fausserait l'intro, la
// galerie et les reveals. Le comportement en production serait correct, mais
// on ne pourrait pas comparer fidelement le rendu en developpement.
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
