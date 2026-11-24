# Jisr Launchpad: Libro blanco

Versión 0.1 · 22 de noviembre de 2026 · Etapa de red de pruebas

Jisr (جسر, «puente») es una plataforma de lanzamiento de meme coins en la que cada moneda tiene un precio mínimo respaldado por dinero guardado en un contrato del que nadie puede retirar. Este documento explica cómo funciona, de qué protege, de qué no protege y qué está construido hoy.

## 1. El problema

La mayoría de los lanzamientos de meme coins terminan igual. Los primeros compradores y el creador tienen monedas que casi no les costaron nada y las venden a quienes llegan después. En una curva de vinculación clásica, el dinero del fondo es solo una fracción del valor de mercado, así que el precio no tiene nada debajo cuando empiezan las ventas. Las defensas habituales (bloqueos, liberación gradual, impuestos de venta) dependen de que alguien cumpla una promesa o de una regla que se puede cambiar.

Jisr elimina las monedas baratas del inicio y pone dinero real debajo de cada moneda.

## 2. Cómo funciona una moneda

Todas las monedas lanzadas en Jisr tienen las mismas condiciones. El creador solo elige el nombre, el símbolo, la imagen, la descripción y los enlaces.

| Condición | Valor |
|---|---|
| Suministro total | 1,000,000,000 monedas, creadas una sola vez |
| Venta | Las primeras 800,000,000 monedas a un único precio fijo |
| Precio de venta (reserva en dólares) | $0.0001 por moneda, una capitalización de $100,000 |
| Por encima del mínimo | Las últimas 200,000,000 monedas, con precio en una curva ascendente |
| Comisión de operación | 5% de cada compra y de cada venta |
| Límite por billetera | 2.5% del suministro (25,000,000 monedas) por billetera |
| Monedas entregadas al creador | Ninguna |

### 2.1 Un solo precio para todos

Las primeras 800 millones de monedas se venden al mismo precio a todo el mundo, incluido el creador. No hay ronda inicial barata, así que nadie tiene monedas que le hayan costado menos que a ti.

### 2.2 El mínimo cubierto

Cada moneda que sale del mercado deposita un precio mínimo en la **reserva del mínimo** de esa moneda. Por eso la reserva siempre tiene lo suficiente para recomprar todas las monedas en circulación al precio mínimo. Cualquier titular puede vender al mercado en cualquier momento y recibir el precio mínimo, menos la comisión del 5%.

Ejemplo con reserva en dólares:

| Paso | Importe |
|---|---|
| Pagas | $1,000.00 |
| Comisión de la compra (5%) | $50.00 |
| Monedas que recibes | 9,500,000 |
| Las vendes todas al precio mínimo | $950.00 antes de la comisión |
| Comisión de la venta (5%) | $47.50 |
| Recibes | $902.50 |

Comprar y luego vender al precio mínimo cuesta un 9.75% en comisiones. Eso es lo máximo que un comprador al precio mínimo puede perder por el mecanismo en sí. Los riesgos de la sección 6 son aparte.

### 2.3 Graduación y mínimo ascendente

Cuando se han vendido las 800 millones de monedas de la venta, la moneda se ha **graduado**. A partir de ahí, el 2% de cada operación que se queda en la reserva la hace mayor de lo necesario, y el precio mínimo se sube para igualarla:

> precio mínimo = reserva del mínimo ÷ el mayor entre (monedas en circulación, 800,000,000)

El precio mínimo nunca baja. En la graduación la reserva tiene unos $81,684 para una moneda de $100,000, así que el mínimo empieza alrededor de un 2.1% por encima del precio de venta y sube con el volumen de operaciones.

### 2.4 Por encima del mínimo

Las últimas 200 millones de monedas cuestan el precio mínimo más una prima que crece a medida que se agotan. La prima se guarda en una **reserva de primas** separada y se devuelve cuando las monedas se venden recorriendo la misma línea.

| Monedas de la curva vendidas | Precio de la siguiente moneda | Valor de mercado a ese precio |
|---|---|---|
| 0 | $0.0001 | $100,000 |
| 100,000,000 | aprox. $0.0004 | aprox. $400,000 |
| 150,000,000 | aprox. $0.0016 | aprox. $1,600,000 |
| 190,000,000 (fin de la curva) | aprox. $0.04 | aprox. $40,000,000 |

El mínimo cubre solo el precio mínimo. Quien paga una prima por encima del mínimo puede perder esa prima si otros venden antes.

### 2.5 A dónde va el 5%

| Parte | Destino | Finalidad |
|---|---|---|
| 1% | El creador de la moneda | Se paga solo cuando la gente opera con la moneda |
| 2% | La reserva del mínimo de la moneda | Sube el mínimo para todos los titulares tras la graduación |
| 2% | La billetera de la plataforma | Mantiene la plataforma |

### 2.6 El límite por billetera

Ninguna billetera puede tener más del 2.5% del suministro de una moneda. Se aplica a todas las billeteras, incluida la del creador. Limita cuánto puede vender de golpe una dirección. No puede impedir que una persona use varias billeteras: una blockchain no sabe que dos direcciones pertenecen a la misma persona.

## 3. Quién controla qué

| Elemento | Quién puede mover sus fondos o cambiarlo |
|---|---|
| Las reservas de una moneda | Nadie. El dinero sale solo hacia un vendedor según la fórmula, hacia el creador como comisión del 1% o hacia la billetera de la plataforma como comisión del 2% |
| Una moneda | Solo sus titulares. Sin nuevas emisiones, sin pausa, sin lista negra, sin cambio de comisiones |
| La billetera de la plataforma | El equipo de la plataforma. Recibe la comisión del 2% |
| El propietario de la fábrica | Puede cambiar qué dirección es la billetera de la plataforma. Nada más |

Los contratos de la moneda y del mercado no tienen propietario, ni actualización, ni pausa, ni función de retiro. El creador no tiene derechos especiales después del lanzamiento. Las pruebas fijan la lista completa de funciones que pueden cambiar el estado, de modo que añadir una función de administración hace fallar la compilación.

El coste de este diseño: si se encuentra un error después del lanzamiento, nadie puede pausar ni corregir un mercado en marcha.

## 4. Para creadores

- Lanzar cuesta una transacción de red. No hay comisión de listado.
- El creador no recibe monedas. Para tener la moneda, compra al precio de venta como todos, dentro del mismo límite del 2.5%.
- El creador gana el 1% de cada operación con su moneda y puede cobrarlo en cualquier momento.
- Nada de lo que compra el creador queda bloqueado ni se libera por etapas, porque pagó el mismo precio que cualquier otro comprador.

## 5. Redes y monedas de reserva

- **Redes.** Los contratos funcionan en cualquier red EVM: Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Robinhood Chain y otras. Una moneda vive en la red en la que se lanzó.
- **Moneda de reserva.** Cada despliegue de la plataforma valora y respalda sus monedas en un solo token: una stablecoin en dólares (USDT o USDC) u otro token estándar, como una acción tokenizada. Con una acción tokenizada, el mínimo es un número de acciones, así que su valor en dólares se mueve con la acción.
- **Pagar con la moneda propia de la red.** Donde hay un enrutador de intercambio conectado, los compradores pueden pagar y cobrar en ETH o BNB. El pago se convierte al entrar y al salir; la reserva solo contiene el token de reserva.
- **Recibir en otra red.** En una plataforma respaldada por USDC, quien vende puede vender en la red de la moneda y recibir los dólares en otra red. La transferencia pasa por el puente de USDC de la propia Circle (CCTP), y la plataforma no guarda nada por el camino. Circle cobra su propia comisión del importe. No está disponible en una plataforma respaldada por USDT o por una acción tokenizada, ni en BNB Chain y Robinhood Chain, a las que el puente de Circle no da servicio.

## 6. Riesgos

Lee esta sección antes de usar la plataforma con algo de valor.

- **Sin auditoría.** Los contratos han superado sus propias pruebas, incluidas operaciones aleatorias y simulaciones de ataques. No han sido revisados por un auditor de seguridad independiente. Un error podría causar pérdida de fondos.
- **Sin rescate.** Nadie puede pausar ni arreglar un mercado en marcha. Esto protege la reserva de las personas y elimina la red de seguridad frente a errores.
- **Comisiones.** Comprar y vender al precio mínimo cuesta un 9.75% en total.
- **Riesgo de la prima.** El mínimo protege el precio mínimo. El dinero pagado por encima del mínimo no está protegido.
- **Riesgo del token de reserva.** Una stablecoin puede perder su paridad y su emisor puede congelar una dirección. Una acción tokenizada sigue a su acción y puede restringir quién puede tenerla. Los contratos no pueden defender contra nada de esto.
- **Riesgo de intercambio.** Pagar con la moneda propia de la red depende del enrutador y de su liquidez, y puede costar más que pagar con el token de reserva.
- **Riesgo del puente.** Una venta que se paga en otra red depende de que el puente de Circle entregue allí los dólares. Si Circle se retrasa o se detiene, la entrega espera. Los contratos no pueden acelerarla ni deshacer la venta.
- **Billeteras vinculadas.** El límite del 2.5% es por dirección.
- **Las monedas enviadas al mercado por transferencia simple**, en lugar de mediante una venta, se pierden para quien las envía.
- **El mínimo es un mecanismo.** Es el importe que el contrato pagará, en el token de reserva, por una moneda. No es una promesa de ganancia y no es un seguro.

## 7. Estado

| Parte | Estado |
|---|---|
| Contratos EVM | Construidos y probados (44 pruebas de contratos) |
| Aplicación web y página de despliegue | Construidas y probadas (24 pruebas en navegador), en línea |
| Despliegue de prueba | En línea en la red de pruebas Sepolia, con dinero de prueba sin valor |
| Auditoría de seguridad independiente | No realizada |
| Despliegue en redes reales | No realizado. Va después de la auditoría |
| Solana | Programa y página construidos y probados juntos. En línea en Solana devnet, una red de pruebas con dinero de prueba, y desplegado de forma que nunca se puede cambiar. No está en la red real |
| Vender en una red y recibir en otra (puente) | Construido y probado con sustitutos de los contratos de Circle. Aún no se ha ejecutado en el puente real de Circle |

Despliegue de prueba en Sepolia:

- Fábrica de la plataforma: `0x5E603f7Fc12D8C2744c9117a43f5021c7dEb5647`
- Solana devnet: `5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8`
- Sitio: https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- Código: https://github.com/w8nwzbf9h5-svg/jisr-launchpad

## 8. Aviso

Este documento describe un software. No es una oferta de ninguna moneda ni asesoramiento financiero. Las monedas lanzadas en Jisr las crean sus creadores, no la plataforma. Quien use la plataforma es responsable de sus propias decisiones.

Esta es una traducción. La versión en inglés es la de referencia; si hay alguna diferencia, vale el texto en inglés.
