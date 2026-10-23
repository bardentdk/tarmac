/**
 * Connexion.tsx — inscription, code de vérification, connexion.
 *
 * Le même compte sert dans l'app et sur le site. À l'inscription, on choisit
 * son rôle : pilote (on envoie ses logs) ou mappeur (on les reçoit). Un
 * mappeur reste un pilote : il peut aussi enregistrer sa propre voiture.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { auth, useAuth } from '~/auth/session';
import { saveProfile } from '~/data/api';
import { Card, ErrorBanner, Field, GhostButton, PrimaryButton, Segmented } from '~/ui/components';

type Mode = 'connexion' | 'inscription';
type Role = 'pilote' | 'mappeur';

export default function Connexion() {
  const [params] = useSearchParams();
  const { user, busy, error, pendingEmail } = useAuth();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'inscription' ? 'inscription' : 'connexion');
  const [role, setRole] = useState<Role>(params.get('role') === 'mappeur' ? 'mappeur' : 'pilote');
  const [name, setName] = useState('');
  const [shop, setShop] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [profileError, setProfileError] = useState<unknown>(null);
  /** Inscription en cours : on attend d'avoir écrit le profil pour quitter l'écran. */
  const [signupPending, setSignupPending] = useState(false);

  useEffect(() => () => auth.clearError(), []);

  // À la première session ouverte après une inscription, on écrit le profil.
  useEffect(() => {
    if (!user || !signupPending) return;
    saveProfile({ pseudo: name.trim(), is_mapper: role === 'mappeur', shop_name: role === 'mappeur' ? shop.trim() : '' })
      .catch((e) => setProfileError(e))
      .finally(() => setSignupPending(false));
  }, [user, signupPending, name, role, shop]);

  const suite = params.get('suite');
  if (user && !signupPending) {
    // Profil non écrit (réseau, migration absente) : l'écran Compte permet de
    // déclarer son rôle à nouveau.
    const target = profileError
      ? '/app/compte'
      : suite ?? (role === 'mappeur' && mode === 'inscription' ? '/mappeur' : '/app');
    return <Navigate to={target} replace />;
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'inscription') {
      setSignupPending(true);
      void auth.signUp(name, email, password).then((ok) => {
        // Refus (compte existant, mot de passe trop court…) : rien à écrire.
        if (!ok && !auth.getSnapshot().pendingEmail) setSignupPending(false);
      });
    } else {
      void auth.signIn(email, password);
    }
  };

  if (pendingEmail) {
    return (
      <section className="wrap" style={{ maxWidth: 460, padding: '56px 20px' }}>
        <Card>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void auth.verifyEmail(otp); }}>
            <h1 className="h1">Confirme ton adresse</h1>
            <p className="dim" style={{ margin: 0 }}>
              Un code à 6 chiffres vient d’être envoyé à <span className="bold" style={{ color: 'var(--text)' }}>{pendingEmail}</span>.
            </p>
            <input
              className="input otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              aria-label="Code reçu par e-mail"
              autoFocus
            />
            <ErrorBanner error={error} />
            <PrimaryButton type="submit" title="Valider" busy={busy} disabled={otp.length < 6} />
            <div className="row12">
              <GhostButton small title="Renvoyer le code" onClick={() => void auth.resendCode()} disabled={busy} />
              <GhostButton small title="Annuler" onClick={() => auth.cancelVerification()} />
            </div>
          </form>
        </Card>
      </section>
    );
  }

  return (
    <section className="wrap" style={{ maxWidth: 460, padding: '56px 20px' }}>
      <Card>
        <form className="stack" onSubmit={submit}>
          <h1 className="h1">{mode === 'connexion' ? 'Connexion' : 'Créer un compte'}</h1>
          <Segmented
            value={mode}
            onChange={(m) => { auth.clearError(); setMode(m); }}
            options={[{ value: 'connexion', label: 'J’ai un compte' }, { value: 'inscription', label: 'Nouveau' }]}
          />
          {mode === 'inscription' ? (
            <>
              <div className="stack-sm">
                <span className="dim small semi">Tu es</span>
                <Segmented value={role} onChange={setRole} options={[{ value: 'pilote', label: 'Pilote' }, { value: 'mappeur', label: 'Mappeur' }]} />
                <span className="dim small">
                  {role === 'pilote'
                    ? 'Tu enregistres tes runs et tes logs, et tu les envoies à ton préparateur.'
                    : 'Tu reçois les logs de tes clients, tu les analyses et tu leur réponds. Utilise l’adresse que tes clients connaissent.'}
                </span>
              </div>
              <Field label="Pseudo" name="name" autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} required />
              {role === 'mappeur' ? (
                <Field label="Nom de l’atelier" name="shop" autoComplete="organization" value={shop} onChange={(e) => setShop(e.target.value)} required />
              ) : null}
            </>
          ) : null}
          <Field label="E-mail" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
            minLength={8}
            hint={mode === 'inscription' ? '8 caractères minimum.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <ErrorBanner error={error} />
          <PrimaryButton type="submit" title={mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'} busy={busy} />
          <p className="dim small" style={{ margin: 0 }}>
            Le même compte fonctionne dans l’app Tarmac et sur ce site.
          </p>
        </form>
      </Card>
    </section>
  );
}
