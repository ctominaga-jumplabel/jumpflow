/**
 * Termos de Uso e Politica de Uso Aceitavel (EP-M08).
 *
 * Fonte canonica do TEXTO: `docs/termos-de-uso-jumpflow.md`. Este modulo deriva
 * aquele conteudo para exibicao na tela `/termos` (estruturado em secoes) e
 * define a VERSAO VIGENTE (`CURRENT_TERMS_VERSION`), consultada pelo gate do
 * layout autenticado e gravada no aceite (`TermsAcceptance.termsVersion`).
 *
 * Ao publicar uma nova versao relevante dos Termos, atualize
 * `CURRENT_TERMS_VERSION` — usuarios sem aceite da nova versao serao
 * bloqueados ate reaceitar. Mantenha o markdown canonico em sincronia.
 */

/**
 * Versao vigente dos Termos. Deve casar com o cabecalho de
 * `docs/termos-de-uso-jumpflow.md`. Bumpar aqui força um novo aceite.
 */
export const CURRENT_TERMS_VERSION = "1.0";

/** Uma secao dos Termos: titulo + paragrafos e/ou itens de lista. */
export interface TermsSection {
  /** Titulo da secao (ex.: "1. Aceitacao destes Termos"). */
  title: string;
  /** Paragrafos de texto corrido, na ordem de exibicao. */
  paragraphs?: string[];
  /** Itens de lista (bullets), exibidos apos os paragrafos. */
  bullets?: string[];
}

/** Documento estruturado exibido na tela `/termos`. */
export interface TermsDocument {
  version: string;
  title: string;
  /** Aviso curto exibido no topo (contexto interno / renomeavel). */
  intro: string;
  sections: TermsSection[];
  /** Frase de fechamento exibida acima dos botoes de aceite/recusa. */
  closing: string;
}

/**
 * Conteudo vigente dos Termos, derivado de `docs/termos-de-uso-jumpflow.md`
 * (versao 1.0). Placeholders entre colchetes serao preenchidos pelo Juridico/DPO
 * na publicacao final; mantidos aqui como no doc canonico.
 */
export const CURRENT_TERMS: TermsDocument = {
  version: CURRENT_TERMS_VERSION,
  title: "Termos de Uso e Política de Uso Aceitável",
  intro:
    "O JumpFlow é uma plataforma interna e corporativa da Jump. Leia atentamente os Termos abaixo. O aceite é condição para o uso da plataforma.",
  sections: [
    {
      title: "1. Aceitação destes Termos",
      paragraphs: [
        "O JumpFlow é uma plataforma interna e corporativa da Jump, destinada a consultores, colaboradores e prestadores autorizados, para gestão de horas, alocações, competências, desenvolvimento, despesas, certificados e demais fluxos operacionais.",
        'Ao acessar a plataforma você declara ter lido, compreendido e aceitado estes Termos de Uso e a Política de Uso Aceitável. O aceite é condição para o uso. Caso não concorde, selecione "Não Aceito" — você será desconectado e não terá acesso à plataforma. Sem o aceite, nenhuma funcionalidade é liberada.',
        "O aceite é registrado (usuário, versão dos Termos, data/hora) para fins de comprovação. Quando estes Termos forem atualizados de forma relevante, um novo aceite poderá ser solicitado.",
      ],
    },
    {
      title: "2. Objeto e escopo",
      paragraphs: [
        "O JumpFlow disponibiliza ferramentas de trabalho para as operações da Jump. O acesso é pessoal e intransferível, vinculado à identidade corporativa do usuário. A plataforma é um instrumento de trabalho — não se destina a uso pessoal alheio às atividades da Jump.",
      ],
    },
    {
      title: "3. Conta e acesso",
      bullets: [
        "A autenticação usa a identidade corporativa (Microsoft Entra ID). Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade realizada sob sua conta.",
        "É proibido compartilhar credenciais, acessar contas de terceiros ou tentar contornar os controles de autenticação e autorização.",
        "Comunique imediatamente ao RH/TI qualquer uso não autorizado ou suspeita de comprometimento.",
      ],
    },
    {
      title: "4. Uso responsável e adequado",
      paragraphs: [
        "Você concorda em utilizar a plataforma de forma ética, profissional e em conformidade com as leis aplicáveis e com as políticas internas da Jump. Em especial, você se compromete a:",
      ],
      bullets: [
        "Inserir informações verdadeiras, precisas e atualizadas (horas, despesas, dados de perfil).",
        "Utilizar cada recurso para sua finalidade legítima de trabalho.",
        "Respeitar os direitos, a privacidade e a dignidade das demais pessoas.",
        "Preservar a integridade e a disponibilidade dos sistemas e das informações.",
      ],
    },
    {
      title: "5. Não discriminação, respeito e conduta",
      paragraphs: [
        "A Jump não tolera discriminação, assédio ou qualquer conduta que viole a dignidade das pessoas. Em todas as interações na plataforma — inclusive no Feed, comentários, feedbacks e demais campos de texto — é estritamente proibido publicar, compartilhar ou promover conteúdo que:",
      ],
      bullets: [
        "discrimine ou incite ódio por raça, cor, etnia, origem, nacionalidade, religião, gênero, identidade ou expressão de gênero, orientação sexual, idade, deficiência, condição social, estado civil ou qualquer outra característica protegida por lei;",
        "constitua assédio moral ou sexual, bullying, ameaça, intimidação ou constrangimento;",
        "seja difamatório, calunioso, obsceno, violento ou de qualquer forma ofensivo;",
        "viole direitos de terceiros ou a legislação vigente.",
      ],
    },
    {
      title: "6. Confidencialidade",
      paragraphs: [
        "As informações acessadas na plataforma (dados de consultores, clientes, projetos, valores, documentos e comunicações internas) são confidenciais e de propriedade da Jump ou de seus clientes. Você se compromete a:",
      ],
      bullets: [
        "não divulgar, copiar ou compartilhar informações confidenciais fora do necessário ao trabalho;",
        "não publicar informações internas, financeiras, de clientes ou de pessoas em canais externos;",
        "manter o dever de confidencialidade inclusive após o término do vínculo com a Jump.",
      ],
    },
    {
      title: "7. Proteção de dados pessoais (LGPD)",
      paragraphs: [
        "O tratamento de dados pessoais na plataforma observa a Lei nº 13.709/2018 (LGPD).",
      ],
      bullets: [
        "Controladora: Jump [razão social / CNPJ a preencher].",
        "Finalidade: gestão operacional, de pessoas e financeira das atividades de consultoria.",
        "Base legal: execução de contrato, cumprimento de obrigação legal/regulatória e legítimo interesse, conforme o caso.",
        "Direitos do titular: confirmação, acesso, correção, portabilidade e demais direitos previstos na LGPD, exercíveis junto ao RH/DPO.",
        "Dados sensíveis e informações de terceiros devem ser tratados apenas quando estritamente necessário e sempre com o cuidado exigido pela lei.",
      ],
    },
    {
      title: "8. Conteúdo publicado pelo usuário (Feed e interações)",
      bullets: [
        "Você é integralmente responsável pelo conteúdo que publica (texto, imagens, vídeos e anexos).",
        "Não publique conteúdo que viole a Seção 5, direitos autorais, confidencialidade ou a LGPD; ao publicar imagens ou vídeos de outras pessoas, garanta que há autorização adequada.",
        "A Jump pode moderar, ocultar ou remover conteúdo inadequado e adotar medidas cabíveis, preservando trilha de auditoria das remoções.",
        "Ao publicar, você concede à Jump licença não exclusiva para exibir o conteúdo no contexto interno da plataforma.",
      ],
    },
    {
      title: "9. Propriedade intelectual",
      paragraphs: [
        "A plataforma, sua marca, código, layout e conteúdos são de titularidade da Jump ou de seus licenciadores. É vedado copiar, modificar, distribuir, realizar engenharia reversa ou explorar a plataforma fora das finalidades autorizadas.",
      ],
    },
    {
      title: "10. Condutas proibidas",
      paragraphs: ["É expressamente vedado:"],
      bullets: [
        "inserir dados falsos, fraudulentos ou enganosos (inclusive horas ou despesas indevidas);",
        "acessar, coletar ou alterar dados sem autorização, ou tentar burlar controles de permissão (RBAC);",
        "introduzir malware, sobrecarregar, testar vulnerabilidades sem autorização ou interferir na operação;",
        "automatizar acessos (scraping/bots) sem autorização expressa;",
        "usar a plataforma para fins ilícitos ou contrários às políticas da Jump.",
      ],
    },
    {
      title: "11. Suspensão e encerramento de acesso",
      paragraphs: [
        "O acesso pode ser suspenso ou encerrado, no todo ou em parte, em caso de violação destes Termos, por exigência legal, encerramento do vínculo ou por necessidade operacional/segurança, sem prejuízo das medidas administrativas e legais aplicáveis.",
      ],
    },
    {
      title: "12. Disponibilidade e isenções",
      paragraphs: [
        "A plataforma é fornecida como ferramenta interna de trabalho, no estado em que se encontra e conforme disponível. A Jump empenha-se em mantê-la disponível e segura, mas pode realizar manutenções, atualizações e alterações de funcionalidades.",
      ],
    },
    {
      title: "13. Alterações dos Termos",
      paragraphs: [
        "Estes Termos podem ser atualizados a qualquer tempo. Alterações relevantes serão comunicadas e poderão exigir novo aceite para a continuidade do uso. A versão vigente fica sempre acessível na plataforma.",
      ],
    },
    {
      title: "14. Legislação e foro",
      paragraphs: [
        "Estes Termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de [cidade/UF a preencher] para dirimir eventuais controvérsias, com renúncia a qualquer outro.",
      ],
    },
    {
      title: "15. Contato",
      paragraphs: [
        "Dúvidas sobre estes Termos, uso da plataforma ou tratamento de dados: RH / People [e-mail] · Encarregado de Dados (DPO) [e-mail].",
      ],
    },
  ],
  closing:
    'Ao clicar em "Aceito", você declara concordância integral com estes Termos de Uso e com a Política de Uso Aceitável. Ao clicar em "Não Aceito", seu acesso será encerrado.',
};
