import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import Classement from '~/pages/Classement'
import Connexion from '~/pages/Connexion'
import { Compte, Garage, LogDetail, Logs, Runs } from '~/pages/client'
import { MapperClient, MapperClients, MapperDossier, MapperInbox } from '~/pages/mappeur'
import { Home, Mappeurs, Telecharger } from '~/pages/public'
import { AppLayout, PublicLayout, RequireAuth } from '~/ui/layouts'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="telecharger" element={<Telecharger />} />
          <Route path="classement" element={<Classement />} />
          <Route path="mappeurs" element={<Mappeurs />} />
          <Route path="connexion" element={<Connexion />} />
        </Route>
        <Route path="app" element={<RequireAuth><AppLayout mode="client" /></RequireAuth>}>
          <Route index element={<Logs />} />
          <Route path="logs/:id" element={<LogDetail />} />
          <Route path="runs" element={<Runs />} />
          <Route path="garage" element={<Garage />} />
          <Route path="compte" element={<Compte />} />
        </Route>
        <Route path="mappeur" element={<RequireAuth><AppLayout mode="mappeur" /></RequireAuth>}>
          <Route index element={<MapperInbox />} />
          <Route path="dossiers/:id" element={<MapperDossier />} />
          <Route path="clients" element={<MapperClients />} />
          <Route path="clients/:ownerId" element={<MapperClient />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
