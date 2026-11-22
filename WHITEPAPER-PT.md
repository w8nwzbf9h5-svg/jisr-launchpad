# Jisr Launchpad: White Paper

Versão 0.1 · 22 de novembro de 2026 · Fase de rede de testes

Jisr (جسر, "ponte") é uma plataforma de lançamento de meme coins em que cada moeda tem um preço mínimo coberto por dinheiro guardado num contrato do qual ninguém pode sacar. Este documento explica como funciona, do que protege, do que não protege e o que está construído hoje.

## 1. O problema

A maioria dos lançamentos de meme coins termina do mesmo jeito. Os primeiros compradores e o criador têm moedas que quase não lhes custaram nada e vendem para quem chega depois. Numa curva de vinculação clássica, o dinheiro do pool é só uma fração do valor de mercado, então o preço não tem nada por baixo quando as vendas começam. As defesas habituais (bloqueios, liberação gradual, taxas de venda) dependem de alguém cumprir uma promessa ou de uma regra que pode ser alterada.

Jisr elimina as moedas baratas do início e coloca dinheiro real debaixo de cada moeda.

## 2. Como funciona uma moeda

Todas as moedas lançadas na Jisr têm as mesmas condições. O criador escolhe apenas o nome, o símbolo, a imagem, a descrição e os links.

| Condição | Valor |
|---|---|
| Oferta total | 1,000,000,000 moedas, criadas uma única vez |
| Venda | As primeiras 800,000,000 moedas a um único preço fixo |
| Preço de venda (reserva em dólares) | $0.0001 por moeda, uma capitalização de $100,000 |
| Acima do piso | As últimas 200,000,000 moedas, com preço numa curva crescente |
| Taxa de negociação | 5% de cada compra e de cada venda |
| Limite por carteira | 2.5% da oferta (25,000,000 moedas) por carteira |
| Moedas dadas ao criador | Nenhuma |

### 2.1 Um preço para todos

As primeiras 800 milhões de moedas são vendidas pelo mesmo preço para todo mundo, inclusive o criador. Não há rodada inicial barata, então ninguém tem moedas que custaram menos do que as suas.

### 2.2 O piso coberto

Cada moeda que sai do mercado deposita um preço de piso na **reserva do piso** dessa moeda. Por isso a reserva sempre tem o suficiente para recomprar todas as moedas em circulação pelo preço de piso. Qualquer titular pode vender ao mercado a qualquer momento e receber o preço de piso, menos a taxa de 5%.

Exemplo com reserva em dólares:

| Etapa | Valor |
|---|---|
| Você paga | $1,000.00 |
| Taxa da compra (5%) | $50.00 |
| Moedas que você recebe | 9,500,000 |
| Você vende todas pelo preço de piso | $950.00 antes da taxa |
| Taxa da venda (5%) | $47.50 |
| Você recebe | $902.50 |

Comprar e depois vender pelo preço de piso custa 9.75% em taxas. Isso é o máximo que um comprador ao preço de piso pode perder pelo mecanismo em si. Os riscos da seção 6 são à parte.

### 2.3 Graduação e piso crescente

Quando todas as 800 milhões de moedas da venda forem vendidas, a moeda está **graduada**. A partir daí, os 2% de cada negociação que ficam na reserva a tornam maior do que o necessário, e o preço de piso é elevado para acompanhar:

> preço de piso = reserva do piso ÷ o maior entre (moedas em circulação, 800,000,000)

O preço de piso nunca é reduzido. Na graduação a reserva tem cerca de $81,684 para uma moeda de $100,000, então o piso começa cerca de 2.1% acima do preço de venda e sobe com o volume negociado.

### 2.4 Acima do piso

As últimas 200 milhões de moedas custam o preço de piso mais um prêmio que cresce à medida que se esgotam. O prêmio fica numa **reserva de prêmios** separada e é devolvido quando as moedas são vendidas ao longo da mesma linha.

| Moedas da curva vendidas | Preço da próxima moeda | Valor de mercado a esse preço |
|---|---|---|
| 0 | $0.0001 | $100,000 |
| 100,000,000 | cerca de $0.0004 | cerca de $400,000 |
| 150,000,000 | cerca de $0.0016 | cerca de $1,600,000 |
| 190,000,000 (fim da curva) | cerca de $0.04 | cerca de $40,000,000 |

O piso cobre apenas o preço de piso. Quem paga um prêmio acima do piso pode perder esse prêmio se outros venderem antes.

### 2.5 Para onde vão os 5%

| Parte | Vai para | Finalidade |
|---|---|---|
| 1% | O criador da moeda | Pago apenas quando as pessoas negociam a moeda |
| 2% | A reserva do piso da moeda | Eleva o piso para todos os titulares após a graduação |
| 2% | A carteira da plataforma | Mantém a plataforma |

### 2.6 O limite por carteira

Nenhuma carteira pode ter mais de 2.5% da oferta de uma moeda. Isso vale para todas as carteiras, inclusive a do criador. O limite restringe quanto um endereço pode vender de uma vez. Não impede que uma pessoa use várias carteiras: uma blockchain não sabe que dois endereços pertencem à mesma pessoa.

## 3. Quem controla o quê

| Item | Quem pode mover seus fundos ou alterá-lo |
|---|---|
| As reservas de uma moeda | Ninguém. O dinheiro sai apenas para um vendedor conforme a fórmula, para o criador como taxa de 1% ou para a carteira da plataforma como taxa de 2% |
| Uma moeda | Apenas seus titulares. Sem novas emissões, sem pausa, sem lista negra, sem mudança de taxas |
| A carteira da plataforma | A equipe da plataforma. Recebe a taxa de 2% |
| O dono da fábrica | Pode mudar qual endereço é a carteira da plataforma. Nada mais |

Os contratos da moeda e do mercado não têm dono, nem atualização, nem pausa, nem função de saque. O criador não tem direitos especiais depois do lançamento. Os testes fixam a lista completa das funções que podem alterar o estado, de modo que adicionar uma função administrativa faz a compilação falhar.

O custo desse desenho: se um erro for encontrado depois do lançamento, ninguém pode pausar nem corrigir um mercado em funcionamento.

## 4. Para criadores

- Lançar custa uma transação de rede. Não há taxa de listagem.
- O criador não recebe moedas. Para ter a moeda, ele compra pelo preço de venda como todo mundo, dentro do mesmo limite de 2.5%.
- O criador ganha 1% de cada negociação da sua moeda e pode sacar a qualquer momento.
- Nada do que o criador compra fica bloqueado ou é liberado em etapas, porque ele pagou o mesmo preço que qualquer outro comprador.

## 5. Redes e moedas de reserva

- **Redes.** Os contratos funcionam em qualquer rede EVM: Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Robinhood Chain e outras. Uma moeda vive na rede em que foi lançada.
- **Moeda de reserva.** Cada implantação da plataforma precifica e cobre suas moedas em um único token: uma stablecoin em dólar (USDT ou USDC) ou outro token padrão, como uma ação tokenizada. Com uma ação tokenizada, o piso é um número de ações, então seu valor em dólares acompanha a ação.
- **Pagar com a moeda própria da rede.** Onde houver um roteador de troca conectado, os compradores podem pagar e receber em ETH ou BNB. O pagamento é convertido na entrada e na saída; a reserva guarda apenas o token de reserva.

## 6. Riscos

Leia esta seção antes de usar a plataforma com qualquer coisa de valor.

- **Sem auditoria.** Os contratos passaram nos próprios testes, incluindo negociação aleatória e simulações de ataque. Não foram revisados por um auditor de segurança independente. Um erro pode causar perda de fundos.
- **Sem resgate.** Ninguém pode pausar ou consertar um mercado em funcionamento. Isso protege a reserva das pessoas e remove a rede de segurança contra erros.
- **Taxas.** Comprar e vender pelo preço de piso custa 9.75% no total.
- **Risco do prêmio.** O piso protege o preço de piso. O dinheiro pago acima do piso não está protegido.
- **Risco do token de reserva.** Uma stablecoin pode perder a paridade e seu emissor pode congelar um endereço. Uma ação tokenizada acompanha sua ação e pode restringir quem pode tê-la. Os contratos não conseguem defender contra nada disso.
- **Risco de troca.** Pagar com a moeda própria da rede depende do roteador e da sua liquidez, e pode custar mais do que pagar com o token de reserva.
- **Carteiras vinculadas.** O limite de 2.5% é por endereço.
- **Moedas enviadas ao mercado por transferência simples**, em vez de uma venda, são perdidas por quem enviou.
- **O piso é um mecanismo.** É o valor que o contrato pagará, no token de reserva, por uma moeda. Não é promessa de lucro e não é seguro.

## 7. Situação

| Parte | Situação |
|---|---|
| Contratos EVM | Construídos e testados (35 testes de contratos) |
| Aplicação web e página de implantação | Construídas e testadas (22 testes no navegador), no ar |
| Implantação de teste | No ar na rede de testes Sepolia, com dinheiro de teste sem valor |
| Auditoria de segurança independente | Não realizada |
| Implantação em redes reais | Não realizada. Vem depois da auditoria |
| Solana | Programa escrito e testado localmente. Não implantado, ainda não está na aplicação web |
| Vender uma moeda em outra rede (ponte) | Planejado. Não construído |

Implantação de teste na Sepolia:

- Fábrica da plataforma: `0x5E603f7Fc12D8C2744c9117a43f5021c7dEb5647`
- Site: https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- Código: https://github.com/w8nwzbf9h5-svg/jisr-launchpad

## 8. Aviso

Este documento descreve um software. Não é uma oferta de nenhuma moeda nem aconselhamento financeiro. As moedas lançadas na Jisr são criadas por seus criadores, não pela plataforma. Quem usa a plataforma é responsável pelas próprias decisões.

Esta é uma tradução. A versão em inglês é a referência; se houver diferença, vale o texto em inglês.
