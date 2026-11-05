# ASF Treino

Página estática de preparação para o surf da rede ASF. O material é educativo, não uma prescrição individual.

## Desenvolvimento local

Não há build nem dependências de produção. Sirva este diretório com um servidor estático, por exemplo:

```sh
python3 -m http.server 8124 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8124/`. A página mantém os links da rede ASF e o script externo `asf-network.js`, responsável pelas integrações compartilhadas. Mudanças locais não publicam o site.

## Conteúdo e armazenamento

- São **12 rotinas fixas**, selecionadas em rodízio por blocos de sete dias desde 1º de janeiro, conforme a data do navegador. Não há geração de treinos inéditos nem revisão clínica semanal.
- O checklist usa `localStorage` na chave **`asf-treino-v1`**. Preserve essa chave e os 19 IDs de `0-0` a `6-1`; a quantidade de itens por dia é `[4, 3, 3, 3, 2, 2, 2]`.
- O carregamento e a troca de semana não regravam nem apagam os dados. A limpeza depende de confirmação explícita.
- Armazenamento inválido ou bloqueado não deve ser sobrescrito. Exiba aviso e mantenha a interação apenas na sessão quando necessário.
- O guia aprovado de 30 dias é independente do checklist. Não atrele a abertura de suas seções a alterações nas marcações.
- As orientações não devem incluir retenção de ar durante exercícios, apneia, improviso de barras em portas, testes máximos ou garantias de resultado.

## Testes

Checagens de conteúdo, JavaScript, JSON-LD e lógica do checklist, sem dependências adicionais:

```sh
node tests/check-static.cjs
```

A integração com um DOM real também pode ser testada quando `jsdom` estiver disponível no ambiente:

```sh
node tests/treino-dom.cjs
```

Esse teste não renderiza a página nem carrega recursos externos.

Testes reais de navegador requerem Node.js, Playwright disponível no ambiente e Chromium. Nenhuma dependência é adicionada ao site:

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/treino.spec.cjs
```

Se o Chromium instalado pelo Playwright já estiver disponível, omita `CHROMIUM_PATH`. Para salvar capturas desktop/mobile, defina `SCREENSHOT_DIR` com um diretório local.

O teste abre um servidor temporário, bloqueia requisições externas e verifica marcações antigas, recarregamento, confirmação de limpeza, mudanças de data, FAQ/SEO, âncoras, teclado, armazenamento indisponível e larguras de 320 a 1440 px. Integrações de cadastro, anúncios, analytics, carregamento de fontes externas e disponibilidade de sites externos precisam de verificação separada; os testes não enviam cadastros nem validam publicação.
