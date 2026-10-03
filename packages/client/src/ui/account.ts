// Accounts and guests: make an account (email, password, username), sign
// in, "Forgot my password", set a new password from the emailed link, and
// sign out. A guest who makes an account keeps their place in a game under
// way: the server upgrades the guest's session.
import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from '@blockyrts/protocol';
import { ApiFailure, type Api } from '../net/api.ts';
import { button, el, field, input, status, type Screen } from './dom.ts';

/** Checks a new account's fields before asking the server; '' when they look right. */
export function accountProblem(email: string, username: string, password: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Type your email address, such as name@example.com.';
  if (!USERNAME_PATTERN.test(username.trim())) return 'A username is 3 to 20 letters, digits, _ or -.';
  if (/^guest/i.test(username.trim())) return 'A username cannot start with "Guest".';
  if (password.length < MIN_PASSWORD_LENGTH) return `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  return '';
}

function failureText(e: unknown): string {
  return e instanceof ApiFailure ? e.message : 'Something went wrong. Try again.';
}

type Page = 'home' | 'register' | 'signin' | 'forgot';

export interface AccountPageOptions {
  /** Why the page is shown (a guest's Save), above the forms. */
  reason?: string;
  /** The first form shown. */
  start?: Page;
  /** The back button's words. */
  backText?: string;
}

/**
 * The Account screen inside a Screen's box. Resolves when the player goes
 * back: true when they are signed in to an account by then.
 */
export function accountPage(screen: Screen, api: Api, opts: AccountPageOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (): void => resolve(api.me?.account != null);
    const back = (box: HTMLElement): void => {
      el('hr', '', undefined, box);
      button(box, opts.backText ?? 'Back', done);
    };
    const reason = (box: HTMLElement): void => {
      if (opts.reason) el('p', 'note lead', opts.reason, box);
    };

    const home = (): void => {
      const box = screen.page('Account');
      const me = api.me;
      if (me?.account) {
        el('p', '', `Signed in as ${me.account.username} (${me.account.email}).`, box);
        el('p', 'note', 'Your saved games are kept under this account, so you can carry on from any computer.', box);
        const st = status(box);
        button(box, 'Sign out', () => {
          st.set('Signing out…');
          api.signOut().then(home, (e: unknown) => st.set(failureText(e), true));
        });
      } else {
        el('p', '', `You are playing as ${me?.name ?? 'a guest'}.`, box);
        el('p', 'note', "A guest's games are not saved. Make an account to keep your games and carry them on from any computer.", box);
        button(box, 'Make an account', register, 'primary');
        button(box, 'Sign in', signin);
      }
      back(box);
    };

    const register = (): void => {
      const box = screen.page('Make an account');
      reason(box);
      const form = el('form', 'account-form', undefined, box);
      form.noValidate = true;
      const email = field(form, 'Email', input('email', 'email', 'email'));
      const username = field(form, 'Username', input('username', 'text', 'username'), 'Your name in the game: 3 to 20 letters, digits, _ or -.');
      const password = field(form, 'Password', input('password', 'password', 'new-password'), `At least ${MIN_PASSWORD_LENGTH} characters.`);
      const submit = el('button', 'primary', 'Make the account', form);
      submit.type = 'submit';
      const st = status(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const problem = accountProblem(email.input.value, username.input.value, password.input.value);
        if (problem) return st.set(problem, true);
        st.set('Making your account…');
        submit.disabled = true;
        api.register(email.input.value.trim(), username.input.value.trim(), password.input.value).then(
          () => (opts.reason ? done() : home()),
          (err: unknown) => {
            submit.disabled = false;
            st.set(failureText(err), true);
          },
        );
      });
      el('p', 'note', 'Already have one?', box);
      button(box, 'Sign in instead', signin);
      back(box);
      email.input.focus();
    };

    const signin = (): void => {
      const box = screen.page('Sign in');
      reason(box);
      const form = el('form', 'account-form', undefined, box);
      form.noValidate = true;
      const login = field(form, 'Email or username', input('login', 'text', 'username'));
      const password = field(form, 'Password', input('password', 'password', 'current-password'));
      const submit = el('button', 'primary', 'Sign in', form);
      submit.type = 'submit';
      const st = status(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!login.input.value.trim() || !password.input.value) return st.set('Type your email or username and your password.', true);
        st.set('Signing in…');
        submit.disabled = true;
        api.signIn(login.input.value.trim(), password.input.value).then(
          () => (opts.reason ? done() : home()),
          (err: unknown) => {
            submit.disabled = false;
            st.set(failureText(err), true);
          },
        );
      });
      button(box, 'Forgot my password', forgot);
      button(box, 'Make an account instead', register);
      back(box);
      login.input.focus();
    };

    const forgot = (): void => {
      const box = screen.page('Forgot my password');
      el('p', 'note', 'Type the email address of your account. We will send a link to set a new password; it works for 30 minutes.', box);
      const form = el('form', 'account-form', undefined, box);
      form.noValidate = true;
      const email = field(form, 'Email', input('email', 'email', 'email'));
      const submit = el('button', 'primary', 'Send the link', form);
      submit.type = 'submit';
      const st = status(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!email.input.value.includes('@')) return st.set('Type your email address.', true);
        st.set('Sending…');
        api.requestReset(email.input.value.trim()).then(
          () => st.set('If that address has an account, a link is on its way. Check your inbox (and the spam folder).'),
          (err: unknown) => st.set(failureText(err), true),
        );
      });
      button(box, 'Back to signing in', signin);
      back(box);
      email.input.focus();
    };

    ({ home, register, signin, forgot })[opts.start ?? 'home']();
  });
}

/** The page the emailed link opens: /reset-password#token=... */
export function resetPasswordPage(screen: Screen, api: Api, token: string): Promise<void> {
  return new Promise((resolve) => {
    const box = screen.page('Set a new password');
    const form = el('form', 'account-form', undefined, box);
    form.noValidate = true;
    const password = field(form, 'New password', input('password', 'password', 'new-password'), `At least ${MIN_PASSWORD_LENGTH} characters.`);
    const submit = el('button', 'primary', 'Set the password', form);
    submit.type = 'submit';
    const st = status(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (password.input.value.length < MIN_PASSWORD_LENGTH) return st.set(`A password needs at least ${MIN_PASSWORD_LENGTH} characters.`, true);
      submit.disabled = true;
      st.set('Saving…');
      api.confirmReset(token, password.input.value).then(
        () => {
          st.set('Your password is set. Sign in with it from Account.');
          form.querySelectorAll('input').forEach((i) => (i.disabled = true));
        },
        (err: unknown) => {
          submit.disabled = false;
          st.set(failureText(err), true);
        },
      );
    });
    el('hr', '', undefined, box);
    button(box, 'To the main menu', () => resolve());
    password.input.focus();
  });
}
