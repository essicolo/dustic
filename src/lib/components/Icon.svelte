<script>
  import Icon from '@iconify/svelte';
  export let icon;
  export let width = "24";
  export let className = "";
</script>

<Icon {icon} {width} class={className} {...$$restProps} />
