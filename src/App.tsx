import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import Classement from '~/pages/Classement'
import Connexion from '~/pages/Connexion'
import RunDetail from '~/pages/run'
import Sante from '~/pages/sante'
import { Compte, Garage, LogDetail, Logs, Runs } from '~/pages/client'
import { MapperClient, MapperClients, MapperDossier, MapperInbox } from '~/pages/mappeur'
import { Home, Mappeurs, NotFound, Securite, Telecharger } from '~/pages/public'
import { AppLayout, PublicLayout, RequireAuth } from '~/ui/layouts'

/** Haut de page à chaque changement d'écran, ou ancre (#faq) si l'adresse en porte une. */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="telecharger" element={<Telecharger />} />
          <Route path="classement" element={<Classement />} />
          <Route path="mappeurs" element={<Mappeurs />} />
          <Route path="connexion" element={<Connexion />} />
          <Route path="securite" element={<Securite />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="app" element={<RequireAuth><AppLayout mode="client" /></RequireAuth>}>
          <Route index element={<Logs />} />
          <Route path="logs/:id" element={<LogDetail />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:id" element={<RunDetail />} />
          <Route path="sante" element={<Sante />} />
          <Route path="garage" element={<Garage />} />
          <Route path="compte" element={<Compte />} />
        </Route>
        <Route path="mappeur" element={<RequireAuth><AppLayout mode="mappeur" /></RequireAuth>}>
          <Route index element={<MapperInbox />} />
          <Route path="dossiers/:id" element={<MapperDossier />} />
          <Route path="clients" element={<MapperClients />} />
          <Route path="clients/:ownerId" element={<MapperClient />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
