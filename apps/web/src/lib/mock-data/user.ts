/**
 * Mocked authenticated user for the MVP shell.
 * NOTE: there is no real authentication wired up yet — this is placeholder data
 * used only to render the shell. Replace once auth is implemented.
 */
export interface MockUser {
  name: string;
  email: string;
  role: string;
  initials: string;
}

export const mockUser: MockUser = {
  name: "Ana Martins",
  email: "ana.martins@jumplabel.com.br",
  role: "Gestora de Área",
  initials: "AM",
};
