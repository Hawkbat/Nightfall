
declare namespace diff {
	function innerHTML(element: HTMLElement, html: string): void
	function outerHTML(element: HTMLElement, html: string): void
	function element(a: HTMLElement, b: HTMLElement, opts?: { inner: boolean }): void
}