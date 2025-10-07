function cartTotals(cart){

     if (!cart.items || cart.items.length === 0) {
        cart.totalQuantity = 0
        cart.totalCartPrice = 0
        cart.totalMRP = 0
        cart.totalDiscount = 0
        return cart
  }

    cart.totalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0)
    cart.totalCartPrice = cart.items.reduce((acc, item) => acc + item.totalPrice, 0);
    cart.totalMRP = cart.items.reduce((acc, item) => acc + item.totalRegularPrice, 0);
    cart.totalDiscount = cart.totalMRP - cart.totalCartPrice

    return cart
}

module.exports = {
    cartTotals
}
