Crie um webapp estático (rodando direto no navegador, sem backend nem instalação) para upload em lote de imagens. O app deve:
	•	Usar uma lib de ML no browser (CLIP via ONNX Runtime Web ou TensorFlow.js) para reconhecer o conteúdo das imagens.
	•	Classificar cada imagem em tema (ex.: leão, lobo, onça, jesus, pequena sereia, caveira, rosa, dragão, dog) e estilo (ex.: realismo, realismo-pb, fineline, geométrico, mandala, aquarela, religiosa, lettering/escrita).
	•	Gerar nomes automáticos no padrão: {tema}-{estilo}-{n} (slug em minúsculo, sem acento, separado por “-”).
	•	Exemplos: pequena-sereia-aquarela, jesus-realismo-pb, leao-realismo, dog-e-escrita-luppi, fineline-geometrico.
	•	Exibir preview de cada imagem com: previsão de tema/estilo, confiança e campo editável para o usuário ajustar manualmente.
	•	Permitir configurar um threshold de confiança: abaixo dele, marcar como “desconhecido” e pedir confirmação manual.
	•	Oferecer botão para baixar todas as imagens renomeadas em ZIP e exportar CSV (original, novo_nome, tema, estilo, confiança).
	•	Interface simples (HTML+Tailwind), com drag & drop, grid de previews e botões de ação.

Entrega final: um projeto estático (index.html + JS/CSS) pronto para deploy em Vercel.
