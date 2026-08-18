import React from 'react'
import PixoveryPage from './components/PixoveryPage.jsx'

// Les 4 props declarees dans data-props du composant <x-dc> d'origine,
// avec leurs valeurs par defaut, reprises a l'identique.
export default function App() {
  return (
    <PixoveryPage
      showIntro={true}
      pink="#EC0070"
      violet="#8F2BFF"
      email="pixovery@gmail.com"
    />
  )
}
